import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../cli/src/artifacts/files.ts';
import { assertOriginalDocument, verifyRetainedView } from './retained/view-scenarios.ts';
import { acquireMobileTest } from '../../cli/test/runtime/mobile-lock.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const expo = process.argv[3] === '--expo';
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'android' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
const device = process.env.ANDROID_SERIAL;
assert(device, 'Choose an arm64 ANDROID_SERIAL emulator');
const evidence = path.join(root, expo ? 'target/react-retained-expo-android' : 'target/react-retained-android');
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const generated = path.join(expo ? renderer : consumer, 'composed application');
const android = path.join(generated, 'android');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', ...(expo ? { NODE_ENV: 'production' } : {}) };
const buildEnv = { ...env, PATH: `${expo ? path.dirname(process.execPath) + ':' : ''}/usr/bin:/bin:/usr/sbin:/sbin` };
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
function expoAction(button: string, result: string, dialog = '') {
  return `- scrollUntilVisible:\n    element:\n      text: ${JSON.stringify(button)}\n    direction: DOWN\n- tapOn: ${JSON.stringify(button)}\n${dialog}- scrollUntilVisible:\n    element:\n      text: ${JSON.stringify(result)}\n    direction: UP`;
}
try {
  rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
  const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(copied), manifest);
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  // The consumer uses the actual npm tarball. No workspace source alias supplies the module.
  run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages/react-native'));
  run('unpack', 'tar', ['-xzf', 'tauri-native-react-native-1.0.0-rc.0.tgz']);
  const sdk = path.join(consumer, 'package');
  mkdirSync(renderer, { recursive: true });
  const expoDependencies = { '@tauri-native/react-native': '1.0.0-rc.0', expo: '57.0.19', react: '19.2.3', 'react-native': '0.86.3', 'react-native-safe-area-context': '5.7.0', 'expo-file-system': '57.0.6', 'expo-constants': '57.0.17', 'expo-modules-core': '57.0.15' };
  if (expo) {
    const exampleRequire = createRequire(path.join(root, 'examples/react-native/package.json'));
    const expoRequire = createRequire(realpathSync(exampleRequire.resolve('expo/package.json')));
    for (const name of [...Object.keys(expoDependencies), 'babel-preset-expo']) {
      const file = path.join(renderer, 'node_modules', name);
      mkdirSync(path.dirname(file), { recursive: true });
      const directory = name === '@tauri-native/react-native' ? sdk : path.dirname(realpathSync((name.startsWith('expo-') ? expoRequire : exampleRequire).resolve(`${name}/package.json`)));
      symlinkSync(directory, file, 'dir');
    }
  } else symlinkSync(path.join(root, 'examples/react-native/node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
  if (expo) {
    cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'fieldnotes.tsx'));
    cpSync(new URL('./retained/expo-index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
    cpSync(new URL('./retained/expo-probe', import.meta.url), path.join(renderer, 'modules/retained-expo-probe'), { recursive: true });
    writeFileSync(path.join(renderer, 'app.json'), JSON.stringify({ expo: { name: 'Retained Expo Fieldnotes', slug: 'retained-expo-fieldnotes', android: { package: appId } } }));
  }
  cpSync(new URL('./retained/build.cjs.fixture', import.meta.url), path.join(renderer, 'build.cjs'));
  writeFileSync(path.join(renderer, 'package.json'), JSON.stringify({ name: 'packed-retained-rn-consumer', private: true, ...(expo ? { dependencies: expoDependencies } : {}) }));
  writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
  run('renderer-build', process.execPath, ['build.cjs', 'android'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_SDK_DIR: sdk });
  const bundle = path.join(renderer, 'index.bundle.js');
  const { composeAndroid } = createRequire(path.join(consumer, 'consumer.cjs'))(path.join(sdk, 'compose.js'));
  const { readRetainedArtifacts: packedReader } = createRequire(path.join(consumer, 'consumer.cjs'))(path.join(sdk, 'retained-artifacts.js'));
  assert.deepEqual(packedReader(copied), manifest);
  const options = { artifactsDir: copied, outputDir: generated, rendererDir: renderer, moduleName: expo ? 'main' : 'RetainedFieldnotes', bundleFile: bundle, expo };
  const composition = composeAndroid(options); assert.equal(composition.changed, true);
  assert.equal(composeAndroid(options).changed, false, 'Identical composition must preserve generated files');
  const receipt = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  // A subclass adds only acceptance layout/telemetry. All attachment and lifecycle forwarding remain generated.
  cpSync(new URL('./retained/AcceptanceActivity.kt.fixture', import.meta.url), path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/AcceptanceActivity.kt'));
  if (expo) {
    const file = path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/AcceptanceActivity.kt');
    writeFileSync(file, readFileSync(file, 'utf8').replace('val notes = File(', 'report.put("expo", JSONObject(dev.taurinative.expoprobe.ProbeState.snapshot()))\n    report.put("expoApplicationHasHost", (application as TauriNativeApplication).reactHost != null)\n    val notes = File('));
  }
  const manifestFile = path.join(android, 'app/src/main/AndroidManifest.xml');
  const compositionManifest = readFileSync(manifestFile, 'utf8');
  writeFileSync(manifestFile, compositionManifest.replace(`android:name="${composition.activity}"`, `android:name="${appId}.AcceptanceActivity"`));
  const gradle = path.join(android, 'app/build.gradle.kts');
  writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'));
  run('source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, buildEnv);
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
  run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.AcceptanceActivity`]);
  pid = run('pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  await until(() => report('baseline').passed === true);
  const baseline = report('baseline');
  flow('initial', '- assertVisible: "RN 86 Hermes"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  flow('back', '- pressKey: Back\n- assertVisible: "RN links 0 back 1"');
  if (expo) flow('expo-initial-modules', expoAction('Expo native modules', 'Expo native active 1 created 1 destroyed 0 callbacks 0 links 0 back 1') + '\n' + expoAction('Expo write file', 'Expo file saved'));
  const initial = report(); assert.equal(initial.listeners, 1);
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(?i)Don.t allow"\n- assertVisible: "Permission prompt-with-rationale"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "RN events 0"');
  const beforePermission = report();
  flow('retire-permission', '- tapOn: "Retire on pause"\n- tapOn: "Request then save"\n- assertVisible: "(?i)While using the app"');
  await until(() => report().permissionRetirement?.generation === 2);
  const permissionRetired = report();
  assert.equal(permissionRetired.retireOnPause, false);
  assert.equal(permissionRetired.permissionRetirement.listeners, 0);
  assert.equal(permissionRetired.permissionRetirement.runtimeStatus, 'ready');
  assert.equal(permissionRetired.permissionRetirement.pid, beforePermission.pid);
  assert(permissionRetired.permissionRetirement.paused > beforePermission.paused);
  flow('grant-permission', '- tapOn: "(?i)While using the app"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN links 0 back 0"\n- pressKey: Back\n- assertVisible: "RN links 0 back 1"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
  const beforeBackground = report();
  if (expo) flow('expo-file-after-retirement', expoAction('Expo native modules', 'Expo native active 1 created 2 destroyed 1 callbacks 0 links 0 back 2') + '\n' + expoAction('Expo read file', 'Expo file preserved'));
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > beforeBackground.stopped && report().paused > beforeBackground.paused);
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1', '-p', appId]);
  flow('resume', '- assertVisible: "RN links 1 back 1"\n- assertVisible: "RN events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN links 0 back 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  const remounted = report();
  if (expo) flow('expo-file-after-reload', expoAction('Expo native modules', 'Expo native active 1 created 3 destroyed 2 callbacks 0 links 1 back 2') + '\n' + expoAction('Expo read file', 'Expo file preserved'));
  assert.deepEqual(remounted.receivedIntents, ['tauri-fieldnotes://notes/1']);
  assert.equal(remounted.pid, initial.pid); assert.equal(remounted.generation, 3);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert(remounted.resumed >= 2 && remounted.paused >= 1);
  run('remounted-deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1?remounted=1', '-p', appId]);
  flow('fresh-events', '- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  assert.deepEqual(report().receivedIntents, ['tauri-fieldnotes://notes/1', 'tauri-fieldnotes://notes/1?remounted=1']);
  const viewIntegration = verifyRetainedView(flow, report, evidence, 2, 1);
  const notes = report().notes; assert.equal(notes.length, 2);
  assert.deepEqual(notes.map((note: { text: string }) => note.text), ['A RN place to remember', 'A place to remember']);
  assert(Math.abs(notes[1].latitude - 37.5665) < 0.01 && Math.abs(notes[1].longitude - 126.978) < 0.01);
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close RN"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 2"');
  await until(() => report().hostDestroyed === true);
  if (expo) await until(() => report().expo.created === 4 && report().expo.destroyed === 4 && report().expoApplicationHasHost === false);
  const closed = report(); assert.equal(closed.listeners, 0); assert.equal(closed.hostClosed, true);
  writeFileSync(path.join(evidence, 'view-closed.json'), JSON.stringify(closed, null, 2) + '\n');
  assertOriginalDocument(closed, false);
  assert.equal(closed.pid, initial.pid);
  assert.equal(run('final-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]), pid);
  const acceptanceApk = path.join(evidence, 'acceptance-release.apk'); cpSync(apk, acceptanceApk);
  // Fresh installs keep Android denial/rationale history independent from the Tauri-owned requests above.
  async function freshPermissions(label: string) {
    run(`${label}-uninstall`, 'adb', ['-s', device!, 'uninstall', appId]); installed = false;
    run(`${label}-install`, 'adb', ['-s', device!, 'install', acceptanceApk]); installed = true;
    run(`${label}-launch`, 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.AcceptanceActivity`]);
    pid = run(`${label}-pid`, 'adb', ['-s', device!, 'shell', 'pidof', appId]);
    await until(() => report('baseline').passed === true);
  }
  await freshPermissions('rn-permissions');
  flow('rn-deny-permission', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "RN permissions"\n- tapOn: "RN check location"\n- assertVisible: "RN coarse false"\n- tapOn: "RN request coarse"\n- tapOn: "(?i)Don.t allow"\n- assertVisible: "RN coarse denied"\n- tapOn: "Tauri permissions"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"\n- tapOn: "Save location"\n- assertVisible: "Location denied"');
  flow('rn-grant-permissions', '- tapOn: "RN permissions"\n- tapOn: "RN request locations"\n- tapOn: "(?i)While using the app"\n- assertVisible: "RN fine granted coarse granted"\n- tapOn: "RN check location"\n- assertVisible: "RN coarse true"\n- tapOn: "Tauri permissions"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
  const rnPermissions = report();
  assert.deepEqual(rnPermissions.rnPermissionRequests.map(({ generation, code }: { generation: number; code: number }) => [generation, code]), [[1, 0], [1, 1]]);
  assert.deepEqual(rnPermissions.rnPermissionResults.map(({ generation, code, grants }: { generation: number; code: number; grants: number[] }) => [generation, code, grants]), [[1, 0, [-1]], [1, 1, [0, 0]]]);
  assert.equal(rnPermissions.notes.length, 1); assert.equal(rnPermissions.notes[0].text, 'A RN place to remember');
  assert.equal(rnPermissions.listeners, 1);
  flow('rn-queued-permissions', '- tapOn: "RN permissions"\n- tapOn: "RN request queued"\n- assertVisible: "RN queued never_ask_again never_ask_again"');
  const rnPermissionQueue = report();
  assert.deepEqual(rnPermissionQueue.rnPermissionResults.map(({ code, grants }: { code: number; grants: number[] }) => [code, grants]), [[0, [-1]], [1, [0, 0]], [2, [-1]], [3, [-1]]]);
  await freshPermissions('rn-retirement');
  flow('rn-retire-permission', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "RN permissions"\n- tapOn: "Retire on pause"\n- tapOn: "RN request then save"\n- assertVisible: "(?i)While using the app"');
  await until(() => report().permissionRetirement?.generation === 2);
  const rnPermissionPending = report();
  assert.equal(rnPermissionPending.permissionRetirement.listeners, 0);
  assert.equal(rnPermissionPending.permissionRetirement.runtimeStatus, 'ready');
  assert.deepEqual(rnPermissionPending.rnPermissionRequests.map(({ generation, code }: { generation: number; code: number }) => [generation, code]), [[1, 0]]);
  assert.deepEqual(rnPermissionPending.rnPermissionResults, []);
  flow('rn-grant-retired-permission', '- tapOn: "(?i)While using the app"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- tapOn: "RN permissions"\n- tapOn: "RN check location"\n- assertVisible: "RN coarse true"\n- tapOn: "RN undeclared camera"\n- assertVisible: "RN camera never_ask_again"');
  const rnPermissionRetired = report();
  assert.equal(rnPermissionRetired.pid, rnPermissionPending.pid);
  assert.equal(rnPermissionRetired.listeners, 1);
  assert.deepEqual(rnPermissionRetired.notes, []);
  // Both RN modules begin at request code zero. The retired listener must never receive the new result.
  assert.deepEqual(rnPermissionRetired.rnPermissionRequests.map(({ generation, code }: { generation: number; code: number }) => [generation, code]), [[1, 0], [2, 0]]);
  assert.deepEqual(rnPermissionRetired.rnPermissionResults.map(({ generation, code, grants }: { generation: number; code: number; grants: number[] }) => [generation, code, grants]), [[2, 0, [-1]]]);
  let expoPermissions;
  if (expo) {
    await freshPermissions('expo-permissions');
    flow('expo-deny-permission', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n' + expoAction('Expo request permission', 'Expo fine denied coarse denied', '- tapOn: "(?i)Don.t allow"\n'));
    assert.equal(report().expo.callbacks, 1);
    flow('expo-retire-permission', '- tapOn: "Retire on pause"\n- scrollUntilVisible:\n    element:\n      text: "Expo request then save"\n    direction: DOWN\n- tapOn: "Expo request then save"\n- assertVisible: "(?i)While using the app"');
    await until(() => report().permissionRetirement?.generation === 2);
    assert.equal(report().permissionRetirement.listeners, 0);
    flow('expo-grant-retired-permission', '- tapOn: "(?i)While using the app"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n' + expoAction('Expo native modules', 'Expo native active 1 created 2 destroyed 1 callbacks 1 links 0 back 0'));
    assert.deepEqual(report().notes, []);
    flow('expo-current-permission', expoAction('Expo request permission', 'Expo fine granted coarse granted') + '\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
    expoPermissions = report();
    assert.equal(expoPermissions.expo.callbacks, 2);
    assert.equal(expoPermissions.expo.created, 2); assert.equal(expoPermissions.expo.destroyed, 1);
    assert.equal(expoPermissions.notes.length, 1); assert.equal(expoPermissions.notes[0].text, 'A RN place to remember');
  }
  // Execute the unmodified generated Activity too: no acceptance subclass, readiness override or native layout hooks.
  run('uninstall-acceptance', 'adb', ['-s', device, 'uninstall', appId]); installed = false;
  writeFileSync(manifestFile, compositionManifest);
  rmSync(path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/AcceptanceActivity.kt'));
  run('default-source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, buildEnv);
  run('default-apk-alignment', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  run('default-install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('default-launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/${composition.activity}`]);
  pid = run('default-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  flow('default-integration', '- assertVisible: "RN 86 Hermes"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- pressKey: Back\n- assertVisible: "RN links 0 back 1"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"');
  if (expo) flow('expo-default-modules', expoAction('Expo native modules', 'Expo native active 1 created 1 destroyed 0 callbacks 0 links 0 back 1') + '\n' + expoAction('Expo write file', 'Expo file saved') + '\n' + expoAction('Expo read file', 'Expo file preserved'));
  run('default-deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/default', '-p', appId]);
  flow('default-link', '- assertVisible: "RN links 1 back 1"\n- assertVisible: "RN events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  flow('default-view', '- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- tapOn: "Check denied capability"\n- assertVisible: "Tauri capability denied location watch"\n- tapOn: "Hide Tauri view"\n- assertVisible: "View detached"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  flow('default-rn-permissions', '- tapOn: "RN permissions"\n- tapOn: "RN request locations"\n- tapOn: "(?i)While using the app"\n- assertVisible: "RN fine granted coarse granted"\n- tapOn: "Tauri permissions"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 2"');
  assert.equal(run('default-final-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]), pid);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert.deepEqual(packedReader(copied), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')), 'Consumer has no Rust producer');
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'android', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'React Native 0.86.3 / Hermes 250829098.0.17 / generated TurboModule and Fabric', expo, sourceFree: true, sourceFreeBuild: `PATH=${buildEnv.PATH} ./gradlew --no-daemon assembleRelease`,
    nonDebuggable: true, libraries, elfAlignment: 'All packaged LOAD segments >= 16 KB; zipalign -c -P 16 -v 4 passed',
    packageSha256: sha256(readFileSync(path.join(consumer, 'tauri-native-react-native-1.0.0-rc.0.tgz'))), artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    apkSha256: sha256(readFileSync(acceptanceApk)), defaultActivity: { activity: composition.activity, pid, apkSha256: sha256(readFileSync(apk)), overriddenHooks: false },
    bundleSha256: sha256(readFileSync(bundle)), baseline, initial, permissionRetired, remounted, viewIntegration, closed, notes,
    rnPermissions, rnPermissionQueue, rnPermissionPending, rnPermissionRetired, expoPermissions,
    uiScenarios: ['original Tauri document embedded without replacement or reload', 'original frontend and RN share real notes/events/ACL', 'competing view rejected without detaching the first', 'component remount and engine replacement restore the original WebView and native clients', 'shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'renderer retirement during pending OS permission prevents the old continuation save', 'undeclared session preserves original caller_denied code/message', 'save and event', 'background deep link and event', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'RN BackHandler and Linking routing', 'remove RN and keep original Tauri frontend'],
    composition: receipt,
    testOnlyIntegration: 'Acceptance subclass supplies layout, baseline readiness and telemetry; packed composeAndroid generates Tauri/RN attachment, startup and lifecycle forwarding. A second Release APK runs the unmodified generated Activity/default layout without that subclass. The original MainActivity and TauriActivity remain in the inheritance chain. Expo and broader source-form coverage remain open.',
    testOnlySigning: 'Non-debuggable Release with R8 optimization and a debug test signing key; process-scoped logcat telemetry',
  }, null, 2) + '\n');
  console.log(`PASS: packed RN retained Android SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
