import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../cli/src/artifacts/files.ts';
import { acquireMobileTest } from '../../cli/test/runtime/mobile-lock.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'android' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
const device = process.env.ANDROID_SERIAL;
assert(device, 'Choose an arm64 ANDROID_SERIAL emulator');
const evidence = path.join(root, 'target/react-retained-android');
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const android = path.join(consumer, 'android');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let pid = '';
function run(label: string, command: string, args: string[], cwd = consumer, environment = env) {
  console.log(`> react-retained-android: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'adb' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}; full output: ${evidence}/${label}.log\n${result.stdout?.slice(-6000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout.trim();
}
function report(kind = 'lifecycle') {
  const result = spawnSync('adb', ['-s', device!, 'logcat', '-d', '--pid', pid, '-v', 'raw', '-s', 'TauriReactAcceptance:I', '*:S'], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const reports = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const found = reports.filter(report => report.kind === kind).at(-1);
  assert(found, `No ${kind} report for process ${pid}`);
  return found.report;
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'RN retained scenario did not reach the expected state');
    await setTimeout(300);
  }
}
function flow(label: string, steps: string) {
  const file = path.join(evidence, `${label}.yaml`);
  writeFileSync(file, `appId: ${appId}\n---\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
}
try {
  rmSync(consumer, { recursive: true, force: true }); cpSync(artifact, consumer, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(consumer), manifest);
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  // The consumer uses the actual npm tarball. No workspace source alias supplies the module.
  run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages/react-native'));
  run('unpack', 'tar', ['-xzf', 'tauri-native-react-native-1.0.0-rc.0.tgz']);
  const sdk = path.join(consumer, 'package');
  mkdirSync(renderer, { recursive: true });
  symlinkSync(path.join(root, 'examples/react-native/node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
  cpSync(new URL('./retained/build.cjs.fixture', import.meta.url), path.join(renderer, 'build.cjs'));
  writeFileSync(path.join(renderer, 'package.json'), '{"name":"packed-retained-rn-consumer","private":true}\n');
  writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
  run('renderer-build', process.execPath, ['build.cjs', 'android'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_SDK_DIR: sdk });
  const bundle = path.join(renderer, 'index.bundle.js');
  const assets = path.join(android, 'app/src/main/assets'); mkdirSync(assets, { recursive: true });
  cpSync(bundle, path.join(assets, 'index.bundle.js'));
  const reactRequire = createRequire(path.join(root, 'examples/react-native/node_modules/react-native/package.json'));
  const reactNative = path.dirname(reactRequire.resolve('react-native/package.json'));
  const codegen = path.dirname(createRequire(path.join(reactNative, 'package.json')).resolve('@react-native/codegen/package.json'));
  assert.equal(JSON.parse(readFileSync(path.join(reactNative, 'package.json'), 'utf8')).version, '0.86.3');
  assert.equal(JSON.parse(readFileSync(path.join(codegen, 'package.json'), 'utf8')).version, '0.86.3');
  const rootGradle = path.join(android, 'build.gradle.kts');
  writeFileSync(rootGradle, readFileSync(rootGradle, 'utf8').replace('1.9.25', '2.1.20') + `\nextra["tauriNativeReactNativeDir"] = ${JSON.stringify(reactNative)}\nextra["tauriNativeReactCodegenDir"] = ${JSON.stringify(codegen)}\nextra["tauriNativeNode"] = ${JSON.stringify(process.execPath)}\nextra["tauriNativeAbis"] = listOf(${manifest.native.map(slice => JSON.stringify(slice.abi)).join(', ')})\n`);
  // AGP 8.11 K2 lint crashes on Tauri's apply(from = "tauri.build.gradle.kts") (b/430991549).
  // Keep Release lint enabled, using its supported K1 analyzer with this pinned toolchain.
  const properties = path.join(android, 'gradle.properties');
  writeFileSync(properties, readFileSync(properties, 'utf8') + '\nandroid.lint.useK2Uast=false\n');
  const client = path.join(android, 'tauri-native-runtime-client');
  const clientJava = path.join(client, 'src/main/java/dev/taurinative/runtime'); mkdirSync(clientJava, { recursive: true });
  const originalClient = path.join(android, 'app/src/main/java/dev/taurinative/runtime/RuntimeSession.java');
  cpSync(originalClient, path.join(clientJava, 'RuntimeSession.java')); rmSync(originalClient);
  writeFileSync(path.join(client, 'build.gradle'), `plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 35\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n`);
  const settings = path.join(android, 'settings.gradle');
  writeFileSync(settings, readFileSync(settings, 'utf8') + "\ninclude ':tauri-native-runtime-client', ':tauri-native-react'\nproject(':tauri-native-react').projectDir = new File(settingsDir, '../package/android/retained')\n");
  cpSync(new URL('./retained/MainActivity.kt.fixture', import.meta.url), path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/MainActivity.kt'));
  const gradle = path.join(android, 'app/build.gradle.kts');
  writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")') + `\nandroid { packaging { jniLibs.pickFirsts += "**/libc++_shared.so" }; defaultConfig { ndk { abiFilters += listOf(${manifest.native.map(slice => JSON.stringify(slice.abi)).join(', ')}) } } }\ndependencies { implementation(project(":tauri-native-react")); implementation(project(":tauri-native-runtime-client")) }\n`);
  run('source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
  const apkMetadata = run('apk-metadata', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk]);
  assert(!apkMetadata.includes('application-debuggable'), 'Acceptance must execute a non-debuggable Release APK');
  run('apk-alignment', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  const libraries = run('apk-libraries', 'unzip', ['-Z1', apk]).split('\n').filter(file => file.startsWith('lib/') && file.endsWith('.so'));
  assert(libraries.length > 0);
  assert.deepEqual([...new Set(libraries.map(file => file.split('/')[1]))].sort(), manifest.native.map(slice => slice.abi).sort(), 'Renderer ABIs must match the exported Tauri slices');
  const elf = path.join(evidence, 'elf'); mkdirSync(elf, { recursive: true });
  for (const library of libraries) {
    const label = library.replaceAll('/', '-');
    run(`extract-${label}`, 'unzip', ['-o', apk, library, '-d', elf]);
    const headers = run(`elf-${label}`, path.join(process.env.NDK_HOME!, 'toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf'), ['-lW', path.join(elf, library)]);
    const loads = headers.split('\n').filter(line => line.trim().startsWith('LOAD '));
    assert(loads.length && loads.every(line => BigInt(line.trim().split(/\s+/).at(-1)!) >= 16384n), `${library} must be 16 KB aligned`);
  }
  run('install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
  pid = run('pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  await until(() => report('baseline').passed === true);
  flow('initial', '- assertVisible: "RN 86 Hermes"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  flow('back', '- pressKey: Back\n- assertVisible: "RN links 0 back 1"');
  const initial = report(); assert.equal(initial.listeners, 1);
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(?i)Don.t allow"\n- assertVisible: "Permission prompt-with-rationale"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "RN events 0"');
  flow('grant-permission', '- tapOn: "Request permission"\n- tapOn: "(?i)While using the app"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
  const beforeBackground = report();
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > beforeBackground.stopped && report().paused > beforeBackground.paused);
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1', '-p', appId]);
  flow('resume', '- assertVisible: "RN links 1 back 1"\n- assertVisible: "RN events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN links 0 back 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  const remounted = report();
  assert.deepEqual(remounted.receivedIntents, ['tauri-fieldnotes://notes/1']);
  assert.equal(remounted.pid, initial.pid); assert.equal(remounted.generation, 2);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert(remounted.resumed >= 2 && remounted.paused >= 1);
  run('remounted-deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1?remounted=1', '-p', appId]);
  flow('fresh-events', '- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  assert.deepEqual(report().receivedIntents, ['tauri-fieldnotes://notes/1', 'tauri-fieldnotes://notes/1?remounted=1']);
  const notes = report().notes; assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'A RN place to remember');
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close RN"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 2"');
  await until(() => report().hostDestroyed === true);
  const closed = report(); assert.equal(closed.listeners, 0); assert.equal(closed.hostClosed, true);
  assert.equal(closed.pid, initial.pid);
  assert.equal(run('final-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]), pid);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')), 'Consumer has no Rust producer');
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'android', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'React Native 0.86.3 / Hermes 250829098.0.17 / generated TurboModule and Fabric', sourceFree: true, sourceFreeBuild: 'PATH=/usr/bin:/bin:/usr/sbin:/sbin ./gradlew --no-daemon assembleRelease',
    nonDebuggable: true, libraries, elfAlignment: 'All packaged LOAD segments >= 16 KB; zipalign -c -P 16 -v 4 passed',
    packageSha256: sha256(readFileSync(path.join(consumer, 'tauri-native-react-native-1.0.0-rc.0.tgz'))), artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    apkSha256: sha256(readFileSync(apk)), bundleSha256: sha256(readFileSync(bundle)), baseline: report('baseline'), initial, remounted, closed, notes,
    uiScenarios: ['shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'save and event', 'background deep link and event', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'RN BackHandler and Linking routing', 'remove RN and keep original Tauri frontend'],
    testOnlyIntegration: 'Consumer fixture layout/bootstrap hooks and RuntimeSession status telemetry; actual packed SDK owns its generated TurboModule, ReactHost/Fabric surface, native event/request lifetime and BackHandler dispatch. Consumer forwards Activity lifecycle/results/intents. Automatic composition/Expo and iOS acceptance remain open.',
    testOnlySigning: 'Non-debuggable Release with R8 optimization and a debug test signing key; process-scoped logcat telemetry',
  }, null, 2) + '\n');
  console.log(`PASS: packed RN retained Android SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
