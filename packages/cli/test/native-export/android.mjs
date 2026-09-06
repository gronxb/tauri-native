import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyAndroidConsumer } from './android-device.mjs';
import { inventory } from '../../src/artifacts/files.ts';
import { androidTools, validateAndroidArtifacts } from '../../src/artifacts/android.ts';
import { publishArtifacts } from '../../src/artifacts/staging.ts';
import { snapshot } from './source-integrity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const evidence = path.join(root, 'target/export-android');
const work = mkdtempSync(path.join(tmpdir(), 'tauri native android '));
const bundleId = `dev.taurinative.artifacttest.run${process.pid}`;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const java = process.env.JAVA_HOME;
assert.ok(sdk && existsSync(sdk), 'Set ANDROID_HOME to the installed Android SDK');
assert.ok(java && existsSync(java), 'Set JAVA_HOME to JDK 17+ (Android Studio bundles a suitable JDK)');
const tools = androidTools();
const suffix = process.platform === 'win32' ? '.exe' : '';
const newest = directory => readdirSync(directory).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
const buildTools = path.join(sdk, 'build-tools', newest(path.join(sdk, 'build-tools')));
const androidJar = path.join(sdk, 'platforms', newest(path.join(sdk, 'platforms')), 'android.jar');
const hostEnvironment = { ...process.env, PATH: `${path.join(java, 'bin')}${path.delimiter}/usr/bin${path.delimiter}/bin`, JAVA_HOME: java };
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function host(command, args, options = {}) { return run(command, args, { env: hostEnvironment, ...options }); }
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
try {
  const cli = path.join(work, 'cli installation'); mkdirSync(cli);
  const cliTarball = process.env.TAURI_NATIVE_CLI_TARBALL ?? path.join(work, JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]))[0].filename);
  writeFileSync(path.join(cli, 'package.json'), '{"private":true}');
  run('npm', ['install', '--prefix', cli, '--ignore-scripts', '--no-audit', '--no-fund', cliTarball]);
  const producer = path.join(work, 'ordinary producer');
  cpSync(path.join(here, '../fixtures/standard-tauri'), producer, { recursive: true });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  const before = snapshot(producer);
  run('npm', ['run', 'build'], { cwd: producer });
  const frontend = inventory(path.join(producer, 'dist'));
  const output = path.join(producer, 'src-tauri/gen/tauri-native/android');
  run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'android', '--incremental'], { cwd: producer });
  assert.deepEqual(snapshot(producer), before);
  validateAndroidArtifacts(output, tools);
  assert.deepEqual(inventory(path.join(output, 'assets/tauri-native')), frontend);
  assert.equal(readFileSync(path.join(output, 'manifest.json'), 'utf8').includes(work), false);

  const published = inventory(output);
  assert.match(run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'android', '--incremental'], { cwd: producer }), /reused validated/);
  assert.deepEqual(inventory(output), published);
  const configPath = path.join(producer, 'src-tauri/tauri.conf.json');
  const configBytes = readFileSync(configPath); const broken = JSON.parse(configBytes);
  broken.build.beforeBuildCommand = 'node -e "process.exit(23)"';
  writeFileSync(configPath, JSON.stringify(broken)); const failedSource = snapshot(producer);
  const failure = spawnSync(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'android'], { cwd: producer, encoding: 'utf8' });
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.deepEqual(snapshot(producer), failedSource); assert.deepEqual(inventory(output), published);
  writeFileSync(configPath, configBytes);

  const damagedSource = path.join(work, 'invalid-core.c');
  writeFileSync(damagedSource, '#include <stdint.h>\nuint32_t tauri_native_abi_version(void){return 2;}\nchar *tauri_native_invoke(const char*a,const char*b){return 0;}\nvoid tauri_native_string_free(char*p){}\nuint64_t tauri_native_session_create(void){return 0;}\nchar *tauri_native_session_start(uint64_t s,const char*i,const char*c,const char*p){return 0;}\nchar *tauri_native_session_poll(uint64_t s){return 0;}\nvoid tauri_native_session_cancel(uint64_t s,const char*i){}\nvoid tauri_native_session_destroy(uint64_t s){}\n');
  run(path.join(tools.bin, `clang${suffix}`), ['--target=aarch64-linux-android24', '-shared', '-fPIC', '-x', 'c', '-', '-o', path.join(work, 'libexternal.so')], { input: 'int external_value(void) { return 1; }\n' });
  for (const [damage, expected] of [['alignment', /not 16 KB aligned/], ['api', /Expected Android API 24/], ['soname', /Incorrect Android library SONAME/], ['architecture', /Incorrect Android ELF architecture/], ['dependency', /Unbundled or unavailable Android dependency/]]) {
    assert.throws(() => publishArtifacts(output, stage => {
      cpSync(output, stage, { recursive: true });
      const library = path.join(stage, `jniLibs/${damage === 'architecture' ? 'armeabi-v7a' : 'arm64-v8a'}/libtauri_native_core.so`);
      const page = damage === 'alignment' ? '4096' : '16384';
      run(path.join(tools.bin, `clang${suffix}`), [`--target=aarch64-linux-android${damage === 'api' ? 26 : 24}`, '-shared', '-fPIC', `-Wl,-z,max-page-size=${page}`, `-Wl,-z,common-page-size=${page}`, `-Wl,-soname,${damage === 'soname' ? 'wrong.so' : 'libtauri_native_core.so'}`, damagedSource, ...(damage === 'dependency' ? ['-L', work, '-Wl,--no-as-needed', '-lexternal'] : []), '-o', library]);
      const manifest = JSON.parse(readFileSync(path.join(stage, 'manifest.json')));
      manifest.files = inventory(stage).filter(file => file.path !== 'manifest.json');
      writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    }, stage => validateAndroidArtifacts(stage, tools)), expected);
    assert.deepEqual(inventory(output), published);
  }
  assert.deepEqual(snapshot(producer), before);

  const rust = path.join(producer, 'src-tauri/src/lib.rs');
  writeFileSync(rust, readFileSync(rust, 'utf8').replace('Hello, {display_name}!', 'Hello again, {display_name}!'));
  const edited = snapshot(producer);
  run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'android', '--incremental'], { cwd: producer });
  assert.deepEqual(snapshot(producer), edited, 'Refreshing after an authored Rust edit must preserve the edited producer');

  const hostRoot = path.join(evidence, 'Independent Host'); rmSync(hostRoot, { recursive: true, force: true }); mkdirSync(hostRoot);
  const relocated = path.join(hostRoot, 'Native Artifacts'); cpSync(output, relocated, { recursive: true });
  rmSync(producer, { recursive: true, force: true }); rmSync(cli, { recursive: true, force: true });
  host('/bin/sh', ['-c', '! command -v cargo && ! command -v rustc']);
  validateAndroidArtifacts(relocated, tools);
  const manifest = JSON.parse(readFileSync(path.join(relocated, 'manifest.json')));
  const payload = path.join(hostRoot, 'apk contents'); mkdirSync(payload);
  cpSync(path.join(relocated, 'jniLibs'), path.join(payload, 'lib'), { recursive: true });
  cpSync(path.join(here, 'android'), path.join(hostRoot, 'src'), { recursive: true });
  const triples = { 'arm64-v8a': 'aarch64-linux-android', 'armeabi-v7a': 'armv7a-linux-androideabi', x86: 'i686-linux-android', x86_64: 'x86_64-linux-android' };
  for (const [abi, triple] of Object.entries(triples)) {
    const library = path.join(payload, 'lib', abi, 'libartifact_host.so');
    host(path.join(tools.bin, `clang${suffix}`), [`--target=${triple}24`, '-std=c11', '-shared', '-fPIC', '-I', path.join(relocated, 'include'), path.join(hostRoot, 'src/host.c'), '-L', path.join(relocated, 'jniLibs', abi), '-ltauri_native_core', '-Wl,-z,max-page-size=16384', '-Wl,-z,common-page-size=16384', '-Wl,-soname,libartifact_host.so', '-o', library]);
    const headers = host(tools.readelf, ['--program-headers', library]);
    const loads = headers.split('\n').filter(line => /^\s*LOAD\s/.test(line));
    assert.ok(loads.length && loads.every(line => BigInt(line.trim().split(/\s+/).at(-1)) >= 16384n), `${abi} host JNI must also be 16 KB aligned`);
  }
  const classes = path.join(hostRoot, 'classes'); mkdirSync(classes);
  host(path.join(java, 'bin', `javac${suffix}`), ['-encoding', 'UTF-8', '--release', '8', '-classpath', androidJar, '-d', classes, path.join(hostRoot, 'src/MainActivity.java')]);
  const classFiles = inventory(classes).map(file => path.join(classes, file.path));
  host(path.join(buildTools, 'd8'), ['--min-api', '24', '--lib', androidJar, '--output', payload, ...classFiles]);
  const androidManifest = path.join(hostRoot, 'AndroidManifest.xml');
  writeFileSync(androidManifest, `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundleId}"><uses-permission android:name="android.permission.INTERNET"/><application android:label="Artifact Test" android:debuggable="true" android:extractNativeLibs="false" android:theme="@android:style/Theme.Material.Light.NoActionBar"><activity android:name="dev.taurinative.artifacttest.MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>`);
  const unsigned = path.join(hostRoot, 'unsigned.apk');
  host(path.join(buildTools, `aapt2${suffix}`), ['link', '-I', androidJar, '--manifest', androidManifest, '--min-sdk-version', '24', '--target-sdk-version', '35', '-A', path.join(relocated, 'assets'), '-o', unsigned]);
  host('zip', ['-q', '-0', '-r', unsigned, 'classes.dex', 'lib'], { cwd: payload });
  const aligned = path.join(hostRoot, 'aligned.apk');
  host(path.join(buildTools, `zipalign${suffix}`), ['-P', '16', '-f', '4', unsigned, aligned]);
  const key = path.join(work, 'test.keystore');
  host(path.join(java, 'bin', `keytool${suffix}`), ['-genkeypair', '-alias', 'test', '-keyalg', 'RSA', '-validity', '1', '-dname', 'CN=Artifact Test', '-keystore', key, '-storepass', 'android', '-keypass', 'android', '-noprompt']);
  const apk = path.join(hostRoot, 'ArtifactHost.apk');
  host(path.join(buildTools, 'apksigner'), ['sign', '--ks', key, '--ks-pass', 'pass:android', '--out', apk, aligned]);
  host(path.join(buildTools, `zipalign${suffix}`), ['-c', '-P', '16', '-v', '4', apk]);
  host(path.join(buildTools, 'apksigner'), ['verify', apk]);
  const prepared = path.join(evidence, 'consumer-prepared.json');
  writeFileSync(prepared, JSON.stringify({
    schemaVersion: 1, bundleId, apk: 'Independent Host/ArtifactHost.apk',
    apkSha256: createHash('sha256').update(readFileSync(apk)).digest('hex'),
    export: { installedCli: true, producerUnchanged: true, producerDeleted: true, relocatedPathWithSpaces: true,
      hostWithoutRust: true, frontendBytesUnchanged: true, validatedAbis: manifest.native, apkAlignment: 16384,
      incrementalReuse: true, refreshedRustObservedInHost: true, failedBuildPreservedOutput: true,
      invalidElfPreservedOutput: ['4 KB alignment', 'API 26', 'wrong SONAME', 'wrong machine', 'unbundled shared dependency'],
    },
  }, null, 2) + '\n');
  if (process.env.ANDROID_CONSUMER_BUILD_ONLY === '1') {
    console.log(`Prepared Android consumer; device execution is still required: ${prepared}`);
  } else await verifyAndroidConsumer(prepared);
} finally {
  rmSync(work, { recursive: true, force: true });
}
