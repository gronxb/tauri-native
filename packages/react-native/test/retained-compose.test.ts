import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import type { AndroidCompositionOptions } from '../plugin/retained-compose-types.d.cts';

const { composeAndroid } = createRequire(import.meta.url)('../compose.js') as { composeAndroid: (options: AndroidCompositionOptions) => { changed: boolean } };
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
  const root = mkdtempSync(path.join(tmpdir(), 'retained RN composition ')); roots.push(root);
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
  for (const name of ['react-native', '@react-native/codegen']) write(renderer, `node_modules/${name}/package.json`, JSON.stringify({ name, version: '0.86.3' }));
  write(renderer, 'package.json', '{"private":true}'); write(renderer, 'index.bundle.js', 'first renderer bundle');
  const options = { artifactsDir: artifact, rendererDir: renderer, outputDir: path.join(root, 'generated app'), moduleName: 'Example', bundleFile: path.join(renderer, 'index.bundle.js') };
  return { root, artifact, renderer, options, receipt, run: () => composeAndroid(options) };
}

test('source-free generation is repeatable; an upgrade preserves consumer files and original artifact bytes', () => {
  const f = fixture(), input = snapshot(f.artifact);
  assert.equal(f.run().changed, true); const first = snapshot(f.options.outputDir);
  assert.equal(f.run().changed, false); assert.deepEqual(snapshot(f.options.outputDir), first);
  write(f.options.outputDir, 'android/consumer-note.txt', 'preserve me');
  write(f.renderer, 'index.bundle.js', 'upgraded renderer bundle');
  assert.equal(f.run().changed, true);
  assert.equal(readFileSync(path.join(f.options.outputDir, 'android/app/src/main/assets/tauri-native-react/index.bundle.js'), 'utf8'), 'upgraded renderer bundle');
  assert.equal(readFileSync(path.join(f.options.outputDir, 'android/consumer-note.txt'), 'utf8'), 'preserve me');
  assert.deepEqual(snapshot(f.artifact), input);
  assert.equal(existsSync(path.join(f.options.outputDir, 'android/app/src/main/java/dev/taurinative/runtime/RuntimeSession.java')), false);
  assert.equal(readFileSync(path.join(f.options.outputDir, 'android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java'), 'utf8'), 'test client');
});

test('damaged input, incompatible dependencies and lifecycle owners leave an existing consumer unchanged', () => {
  const f = fixture(); f.run(); const before = snapshot(f.options.outputDir);
  const original = path.join(f.root, 'original'); cpSync(f.artifact, original, { recursive: true });
  for (const [file, bytes, error] of [
    ['android/app/src/main/jniLibs/arm64-v8a/libapp.so', 'changed binary', /checksum|changed or unexpected/],
    ['android/app/src/main/java/dev/tauri/fixture/MainActivity.kt', 'class MainActivity : OtherActivity()', /custom MainActivity/],
    ['android/app/src/main/AndroidManifest.xml', '<manifest><application android:name="OtherApplication"><activity android:name=".MainActivity" /></application></manifest>', /custom Application/],
    ['android/app/src/main/AndroidManifest.xml', '<manifest><application><activity android:name=".OtherActivity" /></application></manifest>', /launcher Activity/],
  ] as const) {
    cpSync(original, f.artifact, { recursive: true }); write(f.artifact, file, bytes);
    if (!file.endsWith('.so')) f.receipt();
    assert.throws(f.run, error); assert.deepEqual(snapshot(f.options.outputDir), before);
  }
  cpSync(original, f.artifact, { recursive: true });
  write(f.renderer, 'node_modules/@react-native/codegen/package.json', '{"version":"0.87.1"}');
  assert.throws(f.run, /both be 0.86.3/); assert.deepEqual(snapshot(f.options.outputDir), before);
});

test('edited generated files and new file collisions fail before replacement', () => {
  const f = fixture(); f.run();
  write(f.options.outputDir, 'android/app/build.gradle.kts', 'consumer customization');
  const edited = snapshot(f.options.outputDir);
  assert.throws(f.run, /generated file changed/); assert.deepEqual(snapshot(f.options.outputDir), edited);
  rmSync(f.options.outputDir, { recursive: true }); f.run();
  write(f.options.outputDir, 'android/app/src/main/assets/new.txt', 'consumer file');
  const before = snapshot(f.options.outputDir);
  write(f.artifact, 'android/app/src/main/assets/new.txt', 'artifact upgrade'); f.receipt();
  assert.throws(f.run, /conflicts with consumer file/); assert.deepEqual(snapshot(f.options.outputDir), before);
});

test('an output alias cannot overwrite the input and an unowned directory is never replaced', () => {
  const f = fixture(), original = snapshot(f.artifact);
  symlinkSync(f.root, path.join(f.root, 'alias'));
  assert.throws(() => composeAndroid({ ...f.options, outputDir: path.join(f.root, 'alias/copied artifact') }), /must be separate/);
  assert.deepEqual(snapshot(f.artifact), original);
  mkdirSync(f.options.outputDir); write(f.options.outputDir, 'important.txt', 'keep');
  assert.throws(f.run, /not an owned composition/); assert.equal(readFileSync(path.join(f.options.outputDir, 'important.txt'), 'utf8'), 'keep');
});

test('a renderer project may contain generated native output; a new artifact path cannot follow a consumer symlink', () => {
  const f = fixture(); f.options.outputDir = path.join(f.renderer, 'generated native'); f.run();
  const external = path.join(f.root, 'unrelated'); mkdirSync(external);
  symlinkSync(external, path.join(f.options.outputDir, 'android/added'));
  const before = readFileSync(path.join(f.options.outputDir, 'tauri-native-composition.json'));
  write(f.artifact, 'android/added/owned.txt', 'new artifact data'); f.receipt();
  assert.throws(f.run, /conflicts with consumer file/);
  assert.equal(existsSync(path.join(external, 'owned.txt')), false);
  assert.deepEqual(readFileSync(path.join(f.options.outputDir, 'tauri-native-composition.json')), before);
});

test('a failed directory replacement restores the consumer; a failed rollback preserves the backup', t => {
  const f = fixture(); f.run(); const before = snapshot(f.options.outputDir);
  write(f.renderer, 'index.bundle.js', 'upgrade');
  const fs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs');
  const rename = fs.renameSync;
  const output = fs.realpathSync(f.options.outputDir);
  for (const failRollback of [false, true]) {
    t.mock.method(fs, 'renameSync', (from: string, to: string) => {
      if (to === output && (path.basename(from) === 'next' || (failRollback && path.basename(from) === 'previous')))
        throw Object.assign(new Error('Injected directory publication failure'), { code: 'EACCES' });
      return rename(from, to);
    });
    assert.throws(f.run, failRollback ? /previous output preserved at/ : /Injected directory publication failure/);
    t.mock.restoreAll();
    if (!failRollback) assert.deepEqual(snapshot(f.options.outputDir), before);
    else {
      const backup = readdirSync(f.root).filter(name => name.startsWith('.tauri-react-compose-'));
      assert.equal(backup.length, 1);
      assert.deepEqual(snapshot(path.join(f.root, backup[0]!, 'previous')), before);
    }
  }
});
