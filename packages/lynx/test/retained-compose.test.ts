import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import type { AndroidCompositionOptions } from '../plugin/retained-compose-types.d.cts';

const { composeAndroid } = createRequire(import.meta.url)('../compose.cjs') as { composeAndroid: (options: AndroidCompositionOptions) => { changed: boolean } };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function write(root: string, file: string, contents: string) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), contents); }
function snapshot(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? Object.entries(snapshot(root, relative)) : [[relative, sha(readFileSync(path.join(root, relative)))]];
  }));
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'retained Lynx composition ')); roots.push(root);
  const artifact = path.join(root, 'copied artifact'), renderer = path.join(root, 'renderer');
  const appId = 'dev.tauri.fixture';
  // Metadata/conflict tests only. Native gate separately builds and executes real copied binaries.
  const files: Record<string, string> = {
    'commands.json': JSON.stringify({ schemaVersion: 1, abiVersion: 3, commands: [] }),
    'callers.json': JSON.stringify({ version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } }),
    'include/tauri_native_runtime.h': 'test contract',
    'android/settings.gradle': "include ':app'\napply from: 'tauri.settings.gradle'\n",
    'android/tauri.settings.gradle': '', 'android/gradlew': 'test wrapper',
    'android/gradle.properties': 'android.useAndroidX=true\n',
    'android/build.gradle.kts': 'classpath("com.android.tools.build:gradle:8.11.0")\nclasspath("org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25")',
    'android/app/build.gradle.kts': 'android { compileSdk = 36 }',
    'android/app/src/main/AndroidManifest.xml': '<manifest><application><activity android:name=".MainActivity" /></application></manifest>',
    'android/app/src/main/java/dev/taurinative/runtime/RuntimeSession.java': 'test client',
    'android/app/src/main/java/dev/tauri/fixture/MainActivity.kt': `package ${appId}\nimport android.os.Bundle\nimport androidx.activity.enableEdgeToEdge\nclass MainActivity : TauriActivity() {\n override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge(); super.onCreate(savedInstanceState) }\n}`.replace('();', '()'),
    'android/app/src/main/jniLibs/arm64-v8a/libapp.so': 'not a native library: metadata test only',
  };
  for (const [file, bytes] of Object.entries(files)) write(artifact, file, bytes);
  function receipt() {
    const files = Object.entries(snapshot(artifact)).filter(([file]) => file !== 'manifest.json').map(([file, sha256]) => ({ path: file, sha256, size: readFileSync(path.join(artifact, file)).length }));
    write(artifact, 'manifest.json', JSON.stringify({ formatVersion: 2, abiVersion: 3, platform: 'android', profile: 'release', generator: { name: '@tauri-native/cli', version: 'test' },
      compatibility: { mode: 'retained', tauri: '2.11.5', tauriCli: '2.11.4', wry: '0.55.1', tauriRuntimeWry: '2.11.4' }, plugins: {}, commands: 'commands.json', callers: 'callers.json',
      source: { callerPolicySha256: sha(readFileSync(path.join(artifact, 'callers.json'))) }, bootstrap: { owner: 'tauri', project: 'android', activity: `${appId}.MainActivity`, applicationId: appId, minimumApiLevel: 24 },
      native: [{ abi: 'arm64-v8a', path: 'android/app/src/main/jniLibs/arm64-v8a/libapp.so' }], files }));
  }
  receipt();
  write(renderer, 'package.json', '{"private":true}'); write(renderer, 'index.bundle.js', 'first renderer bundle');
  const options = { artifactsDir: artifact, outputDir: path.join(root, 'generated app'), bundleFile: path.join(renderer, 'index.bundle.js') };
  return { root, artifact, renderer, options, receipt, run: () => composeAndroid(options) };
}

test('Lynx composition preserves Tauri startup, shares one client, and upgrades without producer or RN dependencies', () => {
  const f = fixture(), input = snapshot(f.artifact);
  assert.equal(f.run().changed, true); const first = snapshot(f.options.outputDir);
  assert.equal(f.run().changed, false); assert.deepEqual(snapshot(f.options.outputDir), first);
  const read = (file: string) => readFileSync(path.join(f.options.outputDir, file), 'utf8');
  assert.match(read('android/app/src/main/java/dev/tauri/fixture/MainActivity.kt'), /open class MainActivity : TauriActivity/);
  assert.match(read('android/app/src/main/java/dev/tauri/fixture/MainActivity.kt'), /enableEdgeToEdge\(\)/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /dev.tauri.fixture.TauriNativeActivity/);
  assert.equal(read('android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java'), 'test client');
  assert.equal(Object.keys(first).filter(file => file.endsWith('RuntimeSession.java')).length, 1);
  assert.match(read('android/app/build.gradle.kts'), /abiFilters.*arm64-v8a/);
  write(f.options.outputDir, 'android/consumer-note.txt', 'keep');
  write(f.renderer, 'index.bundle.js', 'new Lynx bundle');
  assert.equal(f.run().changed, true);
  assert.equal(read('android/consumer-note.txt'), 'keep');
  assert.equal(read('android/app/src/main/assets/tauri-native-lynx/main.lynx.bundle'), 'new Lynx bundle');
  assert.deepEqual(snapshot(f.artifact), input);
});

test('damaged artifacts, custom owners and competing renderer integration preserve the existing consumer', () => {
  const f = fixture(); f.run(); const before = snapshot(f.options.outputDir);
  const original = path.join(f.root, 'original'); cpSync(f.artifact, original, { recursive: true });
  for (const [file, bytes, error] of [
    ['android/app/src/main/jniLibs/arm64-v8a/libapp.so', 'changed binary', /changed or unexpected/],
    ['android/app/src/main/java/dev/tauri/fixture/MainActivity.kt', 'class MainActivity : OtherActivity()', /custom MainActivity/],
    ['android/app/src/main/AndroidManifest.xml', '<manifest><application android:name="OtherApplication"><activity android:name=".MainActivity" /></application></manifest>', /custom Application/],
    ['android/settings.gradle', "include ':tauri-native-react'", /existing renderer/],
    ['android/build.gradle.kts', 'another toolchain', /verified AGP/],
  ] as const) {
    cpSync(original, f.artifact, { recursive: true }); write(f.artifact, file, bytes);
    if (!file.endsWith('.so')) f.receipt();
    assert.throws(f.run, error); assert.deepEqual(snapshot(f.options.outputDir), before);
  }
});

test('edited output and a different renderer receipt cannot be overwritten by the Lynx composer', () => {
  const f = fixture(); f.run();
  write(f.options.outputDir, 'android/app/build.gradle.kts', 'consumer customization');
  const edited = snapshot(f.options.outputDir);
  assert.throws(f.run, /generated file changed/); assert.deepEqual(snapshot(f.options.outputDir), edited);
  rmSync(f.options.outputDir, { recursive: true }); f.run();
  const file = path.join(f.options.outputDir, 'tauri-native-composition.json');
  const receipt = JSON.parse(readFileSync(file, 'utf8')); receipt.renderer = 'react-native';
  writeFileSync(file, JSON.stringify(receipt));
  const before = snapshot(f.options.outputDir);
  assert.throws(f.run, /invalid prior composition/); assert.deepEqual(snapshot(f.options.outputDir), before);
});
