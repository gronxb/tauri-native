import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { readArtifacts } from '@tauri-native/lynx/artifacts';
import rn from '../../react-native/artifacts.js';
import { writeTestArtifacts } from '../../../scripts/test-artifacts.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const directory = mkdtempSync(path.join(tmpdir(), 'tauri-native-lynx-artifacts-')); roots.push(directory); return directory; }

test('Lynx and RN accept identical relocated generated and legacy exports after producer deletion', async () => {
  for (const platform of ['ios', 'android']) for (const abi of [0, 1, 2]) {
    const directory = root(), producer = path.join(directory, 'producer'), host = path.join(directory, 'Independent Host');
    await writeTestArtifacts(producer, platform, 'shared frontend', abi === 0, abi || 1);
    cpSync(producer, host, { recursive: true }); rmSync(producer, { recursive: true });
    assert.deepEqual(readArtifacts(host, platform), rn.readArtifacts(host, platform));
    assert.equal(readArtifacts(host, platform).abiVersion, abi);
  }
});

test('missing, corrupt, incompatible and linked artifacts fail without a producer fallback', async () => {
  const directory = root();
  for (const platform of ['ios', 'android']) for (const damage of ['missing', 'frontend', 'abi', 'platform', 'link']) {
    const host = path.join(directory, platform); await writeTestArtifacts(host, platform);
    const file = path.join(host, 'manifest.json'), manifest = JSON.parse(readFileSync(file));
    if (damage === 'missing') rmSync(path.join(host, manifest.native[0].path));
    if (damage === 'frontend') writeFileSync(path.join(host, manifest.assets, 'index.html'), 'corrupt');
    if (damage === 'abi' || damage === 'platform') { manifest[damage === 'abi' ? 'abiVersion' : 'platform'] = 99; writeFileSync(file, JSON.stringify(manifest)); }
    if (damage === 'link') { cpSync(file, path.join(directory, 'linked.json')); rmSync(file); symlinkSync(path.join(directory, 'linked.json'), file); }
    assert.throws(() => readArtifacts(host, platform), /Invalid .* artifacts/);
  }
});
