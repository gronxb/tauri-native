import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readArtifacts } from '../../../../scripts/artifacts.ts';
import { readRetainedArtifacts, type RetainedArtifact } from '../../../../scripts/retained-artifacts.ts';
import { inventory, sha256 } from '../../src/artifacts/files.ts';

function receiptTest(run: (directory: string, seal: () => void) => void, platform: 'android' | 'ios' = 'android') {
  const temporary = mkdtempSync(path.join(tmpdir(), 'retained-receipt-'));
  const directory = path.join(temporary, 'export');
  mkdirSync(directory);
  const policy = JSON.stringify({ version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } });
  const contents: Record<string, string> = {
    'commands.json': '{"schemaVersion":1,"abiVersion":3,"commands":[]}', 'callers.json': policy,
    'include/tauri_native_runtime.h': '// ABI 3', ...(platform === 'android' ? { 'android/settings.gradle': '', 'android/tauri.settings.gradle': '',
    'android/gradlew': '', 'android/app/build.gradle.kts': '', 'android/app/src/main/AndroidManifest.xml': '',
    'android/app/src/main/java/dev/taurinative/runtime/RuntimeSession.java': '',
    'android/app/src/main/jniLibs/arm64-v8a/libfixture.so': 'receipt-only fixture; native validity is checked by the export gate',
    } : { 'ios/fixture.xcodeproj/project.pbxproj': '', 'ios/TauriNativeRuntime.xcframework/Info.plist': '',
      'ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a': 'receipt-only fixture; native validity is checked by the export gate',
      'ios/Sources/TauriNativeRuntime/TNRuntimeSession.h': '', 'ios/Sources/TauriNativeRuntime/TNRuntimeSession.mm': '',
      'ios/Sources/TauriNativeRuntime/tauri_native_runtime.h': '', }),
  };
  for (const [file, text] of Object.entries(contents)) { mkdirSync(path.dirname(path.join(directory, file)), { recursive: true }); writeFileSync(path.join(directory, file), text); }
  const manifest: RetainedArtifact = {
    formatVersion: 2, abiVersion: 3, generator: { name: '@tauri-native/cli', version: '1.0.0-rc.0' },
    compatibility: { mode: 'retained', tauri: '2.11.5', tauriCli: '2.11.4', wry: '0.55.1', tauriRuntimeWry: '2.11.4' }, profile: 'debug',
    ...(platform === 'android' ? { platform: 'android',
      bootstrap: { owner: 'tauri', project: 'android', applicationId: 'dev.example', activity: 'dev.example.MainActivity', minimumApiLevel: 24 },
      native: [{ abi: 'arm64-v8a', path: 'android/app/src/main/jniLibs/arm64-v8a/libfixture.so' }],
    } : { platform: 'ios', bootstrap: { owner: 'tauri', project: 'ios', applicationId: 'dev.example', xcodeProject: 'fixture.xcodeproj', target: 'fixture', minimumOsVersion: '14.0' },
      native: [{ path: 'ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a', variant: 'simulator', architectures: ['arm64'] }], }),
    plugins: {}, commands: 'commands.json', callers: 'callers.json',
    source: { inputsSha256: 'a'.repeat(64), callerPolicySha256: sha256(policy) }, files: [],
  };
  function seal() { rmSync(path.join(directory, 'manifest.json'), { force: true }); manifest.files = inventory(directory); writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest)); }
  seal();
  try { run(directory, seal); } finally { rmSync(temporary, { recursive: true, force: true }); }
}

test('a relocated retained receipt stays readable without source; adapter hosts reject it', () => receiptTest(directory => {
  const moved = path.join(path.dirname(directory), 'independent host with spaces');
  cpSync(directory, moved, { recursive: true }); rmSync(directory, { recursive: true });
  assert.equal(readRetainedArtifacts(moved).bootstrap.owner, 'tauri');
  assert.throws(() => readArtifacts(moved), { code: 'artifact_format' });
}));

test('missing native resources and changed libraries fail before consumer integration', () => receiptTest(directory => {
  const library = path.join(directory, 'android/app/src/main/jniLibs/arm64-v8a/libfixture.so');
  writeFileSync(library, 'changed library');
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_checksum' });
  rmSync(library);
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_missing_file' });
}));

test('reinventorying a changed caller policy cannot claim the original compiled delegation', () => receiptTest((directory, seal) => {
  writeFileSync(path.join(directory, 'callers.json'), '{"version":1,"callers":{"native":{"webview":"main","commands":["admin"]}}}');
  seal(); assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_policy' });
}));

test('unverified Tauri and replacement lifecycle owners fail before native loading', () => receiptTest(directory => {
  const file = path.join(directory, 'manifest.json');
  const original = readFileSync(file, 'utf8');
  const value = JSON.parse(original); value.compatibility.tauri = '2.12.0'; writeFileSync(file, JSON.stringify(value));
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_api' });
  const other = JSON.parse(original); other.bootstrap.owner = 'react-native'; writeFileSync(file, JSON.stringify(other));
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_bootstrap' });
  writeFileSync(file, original);
  const library = path.join(directory, 'android/app/src/main/jniLibs/arm64-v8a/libfixture.so');
  rmSync(library); symlinkSync(path.join(directory, 'commands.json'), library);
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_symlink' });
}));

test('relocated iOS bootstrap preserves selected slices and requires its native session client', () => receiptTest((directory, seal) => {
  const moved = path.join(path.dirname(directory), 'iOS consumer with spaces');
  cpSync(directory, moved, { recursive: true });
  const artifact = readRetainedArtifacts(moved);
  assert.equal(artifact.platform, 'ios');
  assert.deepEqual(artifact.native, [{ path: 'ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a', variant: 'simulator', architectures: ['arm64'] }]);
  rmSync(path.join(directory, 'ios/Sources/TauriNativeRuntime/TNRuntimeSession.mm'));
  seal();
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_missing_file' });
}, 'ios'));

test('iOS rejects Intel device claims and external bootstrap paths before integration', () => receiptTest(directory => {
  const file = path.join(directory, 'manifest.json');
  const original = readFileSync(file, 'utf8');
  const value = JSON.parse(original); value.native[0].variant = 'device'; value.native[0].architectures = ['x86_64'];
  writeFileSync(file, JSON.stringify(value));
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_slice' });
  const external = JSON.parse(original); external.bootstrap.xcodeProject = '../producer.xcodeproj';
  writeFileSync(file, JSON.stringify(external));
  assert.throws(() => readRetainedArtifacts(directory), { code: 'artifact_bootstrap' });
}, 'ios'));
