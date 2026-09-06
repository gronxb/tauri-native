import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { inventory, sha256 } from '../src/artifacts/files.ts';
import { validateArtifactManifest, writeArtifactManifest } from '../src/artifacts/manifest.ts';
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

test('missing slices, incompatible ABI, corruption and partial builds preserve the previous export', () => {
  const root = temporary(); const output = path.join(root, 'export'); fixture(output);
  const before = inventory(output);
  const failures: [string, (stage: string) => void][] = [
    ['Missing required iOS slice', stage => editManifest(stage, m => m.native[1].architectures.pop())],
    ['Unsupported artifact', stage => editManifest(stage, m => { m.abiVersion = 2; })],
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
