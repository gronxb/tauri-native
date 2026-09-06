import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { inventory, sha256 } from '../src/artifacts/files.ts';
import { ANDROID_ABIS, IOS_LAYOUT, validateArtifactManifest, writeArtifactManifest } from '../src/artifacts/manifest.ts';
import { publishArtifacts } from '../src/artifacts/staging.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temporary(): string { const root = mkdtempSync(path.join(tmpdir(), 'artifact-test-')); roots.push(root); return root; }
function fixture(root: string, greeting = 'Hello'): void {
  for (const [file, content] of Object.entries({
    'TauriNativeCore.xcframework/device/core.a': 'device binary',
    'TauriNativeCore.xcframework/simulator/core.a': 'simulator binary',
    'TauriNativeAssets.bundle/index.html': greeting,
    'TauriNativeGenerated.podspec': 'relative local pod',
  })) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); }
  writeArtifactManifest(root, {
    ...IOS_LAYOUT,
    native: [
      { path: 'TauriNativeCore.xcframework/device/core.a', architectures: ['arm64'], variant: 'device' },
      { path: 'TauriNativeCore.xcframework/simulator/core.a', architectures: ['arm64', 'x86_64'], variant: 'simulator' },
    ], source: { rustEntrySha256: sha256('ordinary source') },
  }, { schemaVersion: 1, abiVersion: 1, commands: [] });
}
function editManifest(root: string, edit: (manifest: any) => void): void {
  const file = path.join(root, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')); edit(manifest);
  writeFileSync(file, JSON.stringify(manifest));
}

test('the entire artifact inventory validates after copying to a path with spaces', () => {
  const root = temporary(); const output = path.join(root, 'export'); fixture(output);
  const relocated = path.join(root, 'Independent Host', 'Native Artifacts');
  cpSync(output, relocated, { recursive: true }); rmSync(output, { recursive: true });
  assert.equal(validateArtifactManifest(relocated).abiVersion, 1);
  assert.equal(readFileSync(path.join(relocated, 'manifest.json'), 'utf8').includes(root), false);
});

test('copied command bindings are covered by the artifact receipt', () => {
  const root = temporary(); fixture(root);
  const previous = validateArtifactManifest(root);
  assert.ok(previous.platform === 'ios');
  rmSync(path.join(root, 'manifest.json'));
  writeArtifactManifest(root, { ...IOS_LAYOUT, native: previous.native, source: previous.source }, { schemaVersion: 1, abiVersion: 2, commands: [], typeGraph: { definitions: {}, imports: {}, globImports: false } });
  assert.equal(validateArtifactManifest(root).bindings, 'commands.ts');
  writeFileSync(path.join(root, 'commands.ts'), 'types copied from a different application');
  assert.throws(() => validateArtifactManifest(root), /integrity/);
});

test('missing slices, incompatible ABI, corruption and partial builds preserve the previous export', () => {
  const root = temporary(); const output = path.join(root, 'export'); fixture(output);
  const before = inventory(output);
  const failures: [string, (stage: string) => void][] = [
    ['Missing required iOS slice', stage => editManifest(stage, m => m.native[1].architectures.pop())],
    ['Unsupported artifact', stage => editManifest(stage, m => { m.abiVersion = 99; })],
    ['integrity', stage => writeFileSync(path.join(stage, 'TauriNativeAssets.bundle/index.html'), 'corrupt')],
    ['integrity', stage => rmSync(path.join(stage, 'TauriNativeCore.xcframework/device/core.a'))],
    ['frontend build failed', () => { throw new Error('frontend build failed'); }],
  ];
  for (const [message, damage] of failures) {
    assert.throws(() => publishArtifacts(output, stage => { fixture(stage, 'New'); damage(stage); }, validateArtifactManifest), new RegExp(message));
    assert.deepEqual(inventory(output), before);
    validateArtifactManifest(output);
  }
});

test('an export interrupted by SIGTERM leaves the published directory intact', () => {
  const root = temporary(); const output = path.join(root, 'export'); fixture(output);
  const before = inventory(output);
  const source = `import { publishArtifacts } from ${JSON.stringify(new URL('../src/artifacts/staging.ts', import.meta.url).href)};
    import { writeFileSync } from 'node:fs';
    publishArtifacts(${JSON.stringify(output)}, stage => {
      writeFileSync(stage + '/partial-build', 'incomplete'); process.kill(process.pid, 'SIGTERM');
    }, () => { throw new Error('must not publish'); });`;
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source]);
  assert.equal(child.signal, 'SIGTERM', child.stderr.toString());
  assert.deepEqual(inventory(output), before);
});

test('validated replacement atomically exchanges an existing nonempty directory', { skip: process.platform !== 'darwin' }, () => {
  const output = path.join(temporary(), 'Native Artifacts'); fixture(output);
  publishArtifacts(output, stage => fixture(stage, 'New version'), validateArtifactManifest);
  validateArtifactManifest(output);
  assert.equal(readFileSync(path.join(output, 'TauriNativeAssets.bundle/index.html'), 'utf8'), 'New version');
});

test('publication refuses unrelated host files and artifact symlinks', () => {
  const root = temporary(); fixture(root);
  writeFileSync(path.join(root, 'Podfile'), 'host project');
  let built = false;
  assert.throws(() => publishArtifacts(root, () => { built = true; }, () => {}), /dedicated artifact directory/);
  assert.equal(built, false);
  rmSync(path.join(root, 'Podfile'));
  symlinkSync('/etc/hosts', path.join(root, 'TauriNativeAssets.bundle/escape'));
  assert.throws(() => validateArtifactManifest(root), /not links/);
});

test('manifest rejects traversal and duplicate inventory records', () => {
  const root = temporary(); fixture(root);
  const original = readFileSync(path.join(root, 'manifest.json'));
  for (const file of ['../secret', '/absolute', 'C:/absolute', 'assets/../../secret', 'assets\\secret']) {
    writeFileSync(path.join(root, 'manifest.json'), original);
    editManifest(root, m => { m.files[0].path = file; });
    assert.throws(() => validateArtifactManifest(root), /Invalid artifact file/);
  }
  writeFileSync(path.join(root, 'manifest.json'), original);
  editManifest(root, m => m.files.push(m.files[0]));
  assert.throws(() => validateArtifactManifest(root), /Duplicate/);
});

function androidFixture(root: string, text = 'Android frontend'): void {
  for (const [file, content] of Object.entries({
    ...Object.fromEntries(ANDROID_ABIS.map(abi => [`jniLibs/${abi}/libtauri_native_core.so`, abi])),
    'assets/tauri-native/index.html': text,
    'include/tauri_native.h': '#define TAURI_NATIVE_ABI_VERSION 1\n',
  })) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); }
  writeArtifactManifest(root, {
    platform: 'android', minimumApiLevel: 24, pageSize: 16384,
    native: ANDROID_ABIS.map(abi => ({ abi, path: `jniLibs/${abi}/libtauri_native_core.so` })),
    assets: 'assets/tauri-native', integration: null, header: 'include/tauri_native.h',
    source: { rustEntrySha256: sha256('ordinary source') },
  }, { schemaVersion: 1, abiVersion: 1, commands: [] });
}

test('Android artifacts relocate with the same complete inventory contract', () => {
  const root = temporary(); const source = path.join(root, 'export'); androidFixture(source);
  const copy = path.join(root, 'Independent Host', 'Native Artifacts');
  cpSync(source, copy, { recursive: true }); rmSync(source, { recursive: true });
  const manifest = validateArtifactManifest(copy);
  assert.equal(manifest.platform, 'android');
  assert.equal(manifest.integration, null);
  assert.equal(manifest.native.length, 4);
  assert.equal(readFileSync(path.join(copy, manifest.assets, 'index.html'), 'utf8'), 'Android frontend');
});

test('Android missing ABIs, incompatible API/page size and loader paths preserve the last export', () => {
  const output = path.join(temporary(), 'export'); androidFixture(output);
  const before = inventory(output);
  for (const damage of [
    (manifest: any) => manifest.native.pop(),
    (manifest: any) => { manifest.minimumApiLevel = 26; },
    (manifest: any) => { manifest.pageSize = 4096; },
    (manifest: any) => { manifest.native[0].path = 'jniLibs/arm64-v8a/application.so'; },
  ]) {
    assert.throws(() => publishArtifacts(output, stage => { androidFixture(stage); editManifest(stage, damage); }, validateArtifactManifest), /Android/);
    assert.deepEqual(inventory(output), before);
  }
});

test('validated Android replacement owns only its dedicated artifact directory', { skip: process.platform !== 'darwin' }, () => {
  const output = path.join(temporary(), 'export'); androidFixture(output);
  publishArtifacts(output, stage => androidFixture(stage, 'Updated Android frontend'), validateArtifactManifest);
  validateArtifactManifest(output);
  assert.equal(readFileSync(path.join(output, 'assets/tauri-native/index.html'), 'utf8'), 'Updated Android frontend');
});
