import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { prepareRetainedPackage, retainedDependencies, retainedEvidence } from '../../../scripts/retained-test-inputs.ts';
import { sha256 } from '../../cli/src/artifacts/files.ts';
import { assertOriginalDocument, verifyRetainedView } from './retained/view-scenarios.ts';
import { acquireMobileTest } from '../../cli/test/runtime/mobile-lock.ts';
import { cngPurpose, configureCng, verifyCng } from './retained/cng-scenarios.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const dependenciesRoot = retainedDependencies(root, 'react-native');
const flags = new Set(process.argv.slice(3));
assert([...flags].every(flag => ['--expo', '--native-project', '--cng'].includes(flag)), 'Unknown native gate option');
const cng = flags.has('--cng');
const expo = flags.has('--expo') || cng;
const nativeProject = flags.has('--native-project') || cng;
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-ios-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'ios' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
assert(manifest.native.some(slice => slice.variant === 'simulator' && slice.architectures.includes('arm64')), 'This gate requires an arm64 Simulator slice');
const device = process.env.IOS_SIMULATOR_UDID;
assert(device, 'Choose an arm64 IOS_SIMULATOR_UDID');
const evidence = retainedEvidence(root, (expo ? 'react-retained-expo-ios' : 'react-retained-ios') + (cng ? '-cng' : nativeProject ? '-native-project' : ''));
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const generated = nativeProject ? path.join(renderer, 'ios') : path.join(expo ? renderer : consumer, 'composed application');
const ios = nativeProject ? generated : path.join(generated, 'ios');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', ...(expo ? { NODE_ENV: 'production' } : {}) };
const buildEnv = { ...env, PATH: `${expo ? path.dirname(process.execPath) + ':' : ''}/usr/bin:/bin:/usr/sbin:/sbin` };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true }); rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let pid = 0, dataDirectory = '';
function run(label: string, command: string, args: string[], cwd = consumer, environment = env) {
  console.log(`> react-retained-ios: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'xcrun' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}; full output: ${evidence}/${label}.log\n${result.stdout?.slice(-6000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout.trim();
}
function report(name = 'react-lifecycle.json') { return JSON.parse(readFileSync(path.join(dataDirectory, name), 'utf8')); }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    process.kill(pid, 0);
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'RN retained scenario did not reach the expected state');
    await setTimeout(300);
  }
}
function flow(label: string, steps: string) {
  process.kill(pid, 0);
  const file = path.join(evidence, `${label}.yaml`);
  writeFileSync(file, `appId: ${appId}\n---\n- launchApp:\n    stopApp: false\n    permissions: {}\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
  process.kill(pid, 0);
}
function expoAction(button: string, result: string, dialog = '') {
  // iOS accessibility exposes clipped RN descendants above their native container.
  // Restore the real scroll viewport before later controls are tapped by coordinates.
  return `- scrollUntilVisible:\n    element:\n      text: "${button}"\n    direction: DOWN\n- tapOn: "${button}"\n${dialog}- scrollUntilVisible:\n    element:\n      text: "RN 86 Hermes"\n    direction: UP\n- swipe:\n    start: "50%,50%"\n    end: "50%,95%"\n    duration: 800\n- assertVisible: "${result}"`;
}
async function launch() {
  for (const file of ['runtime-report.json', 'react-lifecycle.json']) rmSync(path.join(dataDirectory, file), { force: true });
  const result = run('launch', 'xcrun', ['simctl', 'launch', device!, appId]);
  pid = Number(result.match(/: (\d+)$/)?.[1]);
  assert(Number.isSafeInteger(pid) && pid > 0, result);
  await until(() => report('runtime-report.json').passed === true && report().pid === pid);
}
function launchURL(label: string, url: string, steps: string) {
  const previousPid = pid;
  run(`${label}-terminate`, 'xcrun', ['simctl', 'terminate', device!, appId]);
  for (const name of ['runtime-report.json', 'react-lifecycle.json']) rmSync(path.join(dataDirectory, name), { force: true });
  run(`${label}-open-url`, 'xcrun', ['simctl', 'openurl', device!, url]);
  // No launchApp step: the operating system must start this app from the URL itself.
  const file = path.join(evidence, `${label}.yaml`);
  writeFileSync(file, `appId: ${appId}\n---\n- tapOn:\n    text: "(Open|열기)"\n    optional: true\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
  // The UI above proves URL-driven startup before this already-running PID is observed.
  const observed = run(`${label}-pid`, 'xcrun', ['simctl', 'launch', device!, appId]);
  pid = Number(observed.match(/: (\d+)$/)?.[1]); assert(Number.isSafeInteger(pid) && pid > 0);
  assert.notEqual(pid, previousPid);
  const baseline = report('runtime-report.json'); assert(baseline.passed);
  return { pid, initialURL: url, baseline };
}
try {
  rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
  const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(copied), manifest);
  const packed = prepareRetainedPackage(root, 'react-native', consumer, run);
  const sdk = packed.directory;
  mkdirSync(renderer, { recursive: true });
  const dependencies = { '@tauri-native/react-native': '1.0.0-rc.0', expo: '57.0.19', react: '19.2.3', 'react-native': '0.86.3', 'react-native-safe-area-context': '5.7.0', 'expo-file-system': '57.0.6', 'expo-constants': '57.0.17', 'expo-modules-core': '57.0.15', 'expo-location': '57.0.15' };
  if (expo) {
    const exampleRequire = createRequire(path.join(dependenciesRoot, 'package.json'));
    const expoRequire = createRequire(realpathSync(exampleRequire.resolve('expo/package.json')));
    const location = path.join(renderer, 'installed-expo-location'); mkdirSync(location);
    run('location-package', 'npm', ['pack', 'expo-location@57.0.15', '--ignore-scripts', '--pack-destination', location]);
    run('location-unpack', 'tar', ['-xzf', 'expo-location-57.0.15.tgz', '--strip-components=1'], location);
    if (cng) {
      const requirePrebuild = createRequire(expoRequire.resolve('@expo/prebuild-config/package.json'));
      mkdirSync(path.join(location, 'node_modules/@expo'), { recursive: true });
      symlinkSync(path.dirname(requirePrebuild.resolve('@expo/image-utils/package.json')), path.join(location, 'node_modules/@expo/image-utils'), 'dir');
    }
    for (const name of [...Object.keys(dependencies), 'babel-preset-expo']) {
      const destination = path.join(renderer, 'node_modules', name); mkdirSync(path.dirname(destination), { recursive: true });
      const directory = name === '@tauri-native/react-native' ? sdk : name === 'expo-location' ? location : path.dirname(realpathSync((name.startsWith('expo-') ? expoRequire : exampleRequire).resolve(`${name}/package.json`)));
      symlinkSync(directory, destination, 'dir');
    }
  } else symlinkSync(path.join(dependenciesRoot, 'node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
  cpSync(new URL('./retained/build.cjs.fixture', import.meta.url), path.join(renderer, 'build.cjs'));
  if (expo) {
    cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'fieldnotes.tsx'));
    cpSync(new URL('./retained/expo-ios-index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
    cpSync(new URL('./retained/expo-probe', import.meta.url), path.join(renderer, 'modules/retained-expo-probe'), { recursive: true });
    writeFileSync(path.join(renderer, 'app.json'), JSON.stringify({ expo: { name: 'Retained Expo Fieldnotes', slug: 'retained-expo-fieldnotes', ios: { bundleIdentifier: appId } } }));
  }
  writeFileSync(path.join(renderer, 'package.json'), JSON.stringify({ name: 'packed-retained-rn-consumer', private: true, ...(expo ? { dependencies } : {}) }));
  writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
  run('renderer-build', process.execPath, ['build.cjs', 'ios'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_DEPENDENCIES: dependenciesRoot, RETAINED_SDK_DIR: sdk });
  const bundle = path.join(renderer, 'index.bundle.js');
  const { composeIos } = createRequire(path.join(consumer, 'consumer.cjs'))(path.join(sdk, 'compose.js'));
  const { readRetainedArtifacts: packedReader } = createRequire(path.join(consumer, 'consumer.cjs'))(path.join(sdk, 'retained-artifacts.js'));
  assert.deepEqual(packedReader(copied), manifest);
  const options = { artifactsDir: copied, outputDir: generated, rendererDir: renderer, moduleName: expo ? 'main' : 'RetainedFieldnotes', bundleFile: bundle, expo, ...(nativeProject ? { layout: 'native-project' } : {}) };
  if (cng) configureCng(renderer, copied, 'ios', bundle);
  const cngResult = cng ? await verifyCng(renderer, 'ios', (label, text) => writeFileSync(path.join(evidence, `${label}.log`), text)) : undefined;
  const composition = cngResult ?? composeIos(options); assert.equal(composition.changed, true);
  if (!cng) assert.equal(composeIos(options).changed, false);
  const receipt = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  const main = path.join(ios, cngResult?.main ?? 'Sources/ordinary-tauri-mobile-fieldnotes/main.mm');
  const generatedMain = readFileSync(main, 'utf8');
  run('pods', 'pod', ['install'], ios);
  const regenerated = cng ? await createRequire(path.join(renderer, 'package.json'))('@tauri-native/react-native/prebuild').prebuildRetainedExpo({ projectRoot: renderer, platform: 'ios' }) : composeIos(options);
  assert.equal(regenerated.changed, true, 'Regeneration must accept the recorded CocoaPods project and restore generated inputs');
  run('pods-regenerated', 'pod', ['install'], ios);
  const podIntegration = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  cpSync(new URL('./retained/IosAcceptance.mm.fixture', import.meta.url), path.join(path.dirname(main), 'IosAcceptance.mm'));
  if (expo) {
    const file = path.join(path.dirname(main), 'IosAcceptance.mm');
    writeFileSync(file, '#import <Foundation/Foundation.h>\n@protocol TNExpoProbeReading <NSObject>\n+ (id<TNExpoProbeReading>)shared;\n- (NSDictionary *)snapshot;\n@end\n' + readFileSync(file, 'utf8').replace('@"pid": @(NSProcessInfo', '@"expo": [[(Class<TNExpoProbeReading>)NSClassFromString(@"TNExpoProbeState") shared] snapshot],\n    @"pid": @(NSProcessInfo'));
    if (cng) writeFileSync(file, readFileSync(file, 'utf8').replace('../TauriNativeRuntime/TNRuntimeSession.h', '../Sources/TauriNativeRuntime/TNRuntimeSession.h').replace('@"pid": @(NSProcessInfo', '@"cngProbe": [NSBundle.mainBundle objectForInfoDictionaryKey:@"TauriNativeCNGProbe"],\n    @"pid": @(NSProcessInfo'));
  }
  writeFileSync(main, '#import "IosAcceptance.mm"\n' + generatedMain.replace('[TNReactComposition installWithModule:', '[TNReactAcceptance installWithModule:'));
  const workspace = composition.workspace;
  const derived = path.join(evidence, 'derived-data');
  const configuration = cng ? 'Release' : 'release';
  run('source-free-build', 'xcodebuild', ['-workspace', workspace, '-scheme', manifest.bootstrap.target, '-configuration', configuration, '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'build'], ios, buildEnv);
  const products = path.join(derived, `Build/Products/${configuration}-iphonesimulator`);
  const apps = readdirSync(products).filter(file => file.endsWith('.app')); assert.equal(apps.length, 1);
  const app = path.join(products, apps[0]!);
  const info = JSON.parse(run('app-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')]));
  assert.equal(info.MinimumOSVersion, composition.minimumOsVersion);
  assert.equal(info.NSLocationWhenInUseUsageDescription, cng ? cngPurpose : 'Attach your current location to a note when you request it.');
  assert(info.CFBundleURLTypes?.some((item: { CFBundleURLSchemes: string[] }) => item.CFBundleURLSchemes.includes('tauri-fieldnotes')));
  run('install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
  const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(container, 'Library/Application Support', appId);
  run('privacy-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  run('gps', 'xcrun', ['simctl', 'location', device, 'set', '37.5665,126.9780']);
  await launch();
  const baseline = report('runtime-report.json');
  const cngNativeProbe = cng ? report().cngProbe : undefined;
  if (cng) assert.equal(cngNativeProbe, 'actual config plugin', 'The installed app must consume the config-plugin Info.plist value');
  flow('initial', '- assertVisible: \"RN 86 Hermes\"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN initial none"\n- assertVisible: "RN URL none"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  if (expo) flow('expo-initial-modules', expoAction('Expo native modules', 'Expo created 1 destroyed 0 URLs 0 activities 0') + '\n' + expoAction('Expo write file', 'Expo file saved') + '\n' + expoAction('Expo app callbacks', 'Expo callbacks once'));
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(Don.t Allow|허용 안 함)"\n- assertVisible: "Permission denied"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "RN events 0"');
  const denied = report();
  run('stop-denied', 'xcrun', ['simctl', 'terminate', device, appId]);
  run('reset-denied', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  await launch();
  const beforePermission = report();
  flow('retire-permission', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Retire on pause"\n- tapOn: "Request then save"\n- assertVisible: "(Allow While Using App|앱을 사용하는 동안 허용)"');
  await until(() => report().permissionRetirement?.generation === 2);
  const permissionRetired = report();
  assert.equal(permissionRetired.retireOnPause, false);
  assert.equal(permissionRetired.permissionRetirement.listeners, 0);
  assert.equal(permissionRetired.permissionRetirement.runtimeStatus, 'ready');
  assert.equal(permissionRetired.permissionRetirement.pid, beforePermission.pid);
  assert(permissionRetired.permissionRetirement.paused > beforePermission.paused);
  flow('grant-permission', '- tapOn: "(Allow While Using App|앱을 사용하는 동안 허용)"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
  const saved = report(); assert.equal(saved.listeners, 1); assert.equal(saved.reactThreads.length, 1);
  if (expo) flow('expo-file-after-retirement', expoAction('Expo native modules', 'Expo created 2 destroyed 1 URLs 0 activities 0') + '\n' + expoAction('Expo read file', 'Expo file preserved'));
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > saved.stopped);
  run('deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1']);
  flow('resume', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 2"\n- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN links 0 back 0"\n- assertVisible: "RN initial none"\n- assertVisible: "RN URL none"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  await until(() => report().reactThreads.length === 1);
  const remounted = report();
  assert.equal(remounted.pid, saved.pid); assert.equal(remounted.generation, 3);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert.equal(remounted.appDelegate, 'AppDelegate'); assert(remounted.stopped >= 1 && remounted.resumed > saved.resumed);
  if (expo) flow('expo-file-after-reload', expoAction('Expo native modules', 'Expo created 3 destroyed 2 URLs 1 activities 0') + '\n' + expoAction('Expo read file', 'Expo file preserved'));
  run('remounted-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1?remounted=1']);
  flow('fresh-events', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 1"\n- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/1[?]remounted=1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  run('repeat-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1?remounted=1']);
  flow('repeated-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 2"\n- assertVisible: "RN links 2 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/1[?]remounted=1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 3 notes 1 setup 1 plugins 1"');
  flow('activity-routing', '- tapOn: "Continue web link"\n- assertVisible: "RN events 3"\n- assertVisible: "RN links 3 back 0"\n- assertVisible: "RN URL https://example[.]invalid/tauri-native-handoff"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 4 notes 1 setup 1 plugins 1"');
  const activityRouting = report();
  assert.equal(activityRouting.unrelatedActivityHandled, false);
  assert.equal(activityRouting.browsingActivityHandled, true); assert.equal(activityRouting.restorationCalls, 0);
  const viewIntegration = verifyRetainedView(flow, report, evidence, 4, 3);
  const notes = report('notes.json'); assert.equal(notes.length, 2);
  assert.deepEqual(notes.map((note: { text: string }) => note.text), ['A RN place to remember', 'A place to remember']);
  assert(Math.abs(notes[1].latitude - 37.5665) < 0.01 && Math.abs(notes[1].longitude - 126.978) < 0.01);
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close RN"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 4"');
  await until(() => report().reactThreads.length === 0);
  if (expo) await until(() => report().expo.created === 4 && report().expo.destroyed === 4);
  const closed = report(); assert.equal(closed.hostClosed, true); assert.equal(closed.listeners, 0);
  writeFileSync(path.join(evidence, 'view-closed.json'), JSON.stringify(closed, null, 2) + '\n');
  assertOriginalDocument(closed, false);
  assert.equal(closed.pid, saved.pid); assert.equal(closed.appDelegate, saved.appDelegate);
  assert(saved.delegateUnchanged && remounted.delegateUnchanged && closed.delegateUnchanged);
  assert.equal(saved.urlCallbacksRestored, false); assert.equal(remounted.urlCallbacksRestored, false);
  assert.equal(closed.urlCallbacksRestored, true);
  run('closed-deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/closed']);
  flow('closed-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 5"');
  assert.equal(report().listeners, 0); assert.equal(report().reactThreads.length, 0);
  assert.equal(report().pid, closed.pid); assert.equal(report().urlCallbacksRestored, true);
  run('delayed-terminate', 'xcrun', ['simctl', 'terminate', device, appId]);
  for (const name of ['runtime-report.json', 'react-lifecycle.json']) rmSync(path.join(dataDirectory, name));
  const hold = path.join(dataDirectory, 'hold-react-attachment'); writeFileSync(hold, 'hold renderer attachment\n');
  const delayedLaunch = run('delayed-launch', 'xcrun', ['simctl', 'launch', device, appId]);
  pid = Number(delayedLaunch.match(/: (\d+)$/)?.[1]); assert(Number.isSafeInteger(pid) && pid > 0);
  await until(() => report('runtime-report.json').passed === true);
  assert(!existsSync(path.join(dataDirectory, 'react-lifecycle.json')));
  run('delayed-open-url', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/during-startup']);
  flow('delayed-original-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 1"');
  assert(!existsSync(path.join(dataDirectory, 'react-lifecycle.json')));
  rmSync(hold);
  await until(() => report().pid === pid);
  flow('delayed-renderer-link', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN initial none"\n- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/during-startup"\n- tapOn: "Check initial URL"\n- assertVisible: "Initial API none"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 2 setup 1 plugins 1"');
  const delayedStartup = { pid, baseline: report('runtime-report.json'), lifecycle: report() };
  assert.equal(delayedStartup.lifecycle.launchURL, null); assert(delayedStartup.lifecycle.delegateUnchanged);
  assert.equal(saved.launchURL, null);
  const coldRemount = launchURL('cold-remount', 'tauri-fieldnotes://notes/cold-remount', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN initial tauri-fieldnotes://notes/cold-remount"\n- assertVisible: "RN links 0 back 0"\n- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN initial tauri-fieldnotes://notes/cold-remount"\n- assertVisible: "RN links 0 back 0"\n- tapOn: "Check initial URL"\n- assertVisible: "Initial API tauri-fieldnotes://notes/cold-remount"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 2 setup 1 plugins 1"');
  await until(() => report().generation === 2 && report().reactThreads.length === 1);
  const coldRemounted = report();
  assert.equal(coldRemounted.pid, coldRemount.pid); assert.equal(coldRemounted.listeners, 1);
  assert.equal(coldRemounted.listenersAfterRelease, 0); assert(coldRemounted.delegateUnchanged);
  assert.equal(coldRemounted.launchURL, 'tauri-fieldnotes://notes/cold-remount');
  let expoPermissions, expoDefaultPermissions;
  if (expo) {
    run('expo-denial-terminate', 'xcrun', ['simctl', 'terminate', device, appId]);
    run('expo-denial-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
    await launch();
    flow('expo-deny-permission', expoAction('Expo request permission', 'Expo permission denied', '- tapOn: "(Don.t Allow|허용 안 함)"\n'));
    assert.equal(report('notes.json').length, 2);
    run('expo-retirement-terminate', 'xcrun', ['simctl', 'terminate', device, appId]);
    run('expo-retirement-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
    await launch();
    flow('expo-retire-permission', '- tapOn: "Retire on pause"\n- scrollUntilVisible:\n    element:\n      text: "Expo request then save"\n    direction: DOWN\n- tapOn: "Expo request then save"\n- assertVisible: "(Allow While Using App|앱을 사용하는 동안 허용)"');
    await until(() => report().permissionRetirement?.generation === 2);
    assert.equal(report().permissionRetirement.listeners, 0);
    flow('expo-grant-retired-permission', '- tapOn: "(Allow While Using App|앱을 사용하는 동안 허용)"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 2 setup 1 plugins 1"\n' + expoAction('Expo native modules', 'Expo created 2 destroyed 1 URLs 0 activities 0'));
    assert.deepEqual(report('notes.json'), notes, 'Retired Expo continuation must not save a note');
    flow('expo-current-permission', expoAction('Expo request permission', 'Expo permission granted') + '\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 3"\n- assertVisible: "RN events 1"\n' + expoAction('Expo get location', 'Expo location received'));
    expoPermissions = { lifecycle: report(), notes: report('notes.json') };
    assert.equal(expoPermissions.lifecycle.listeners, 1); assert.equal(expoPermissions.lifecycle.reactThreads.length, 1);
    assert.equal(expoPermissions.notes.length, 3); assert.equal(expoPermissions.notes[2].text, 'A RN place to remember');
  }
  const acceptanceBinarySha256 = sha256(readFileSync(path.join(app, info.CFBundleExecutable)));
  run('uninstall-acceptance', 'xcrun', ['simctl', 'uninstall', device, appId]); installed = false;
  writeFileSync(main, generatedMain); rmSync(path.join(path.dirname(main), 'IosAcceptance.mm'));
  run('default-source-free-build', 'xcodebuild', ['-workspace', workspace, '-scheme', manifest.bootstrap.target, '-configuration', configuration, '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'ARCHS=arm64', 'CODE_SIGNING_ALLOWED=NO', 'build'], ios, buildEnv);
  run('default-install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
  const defaultContainer = run('default-container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(defaultContainer, 'Library/Application Support', appId);
  const defaultLaunch = run('default-launch', 'xcrun', ['simctl', 'launch', device, appId]);
  pid = Number(defaultLaunch.match(/: (\d+)$/)?.[1]); assert(Number.isSafeInteger(pid) && pid > 0);
  await until(() => report('runtime-report.json').passed === true);
  flow('default-integration', '- assertVisible: "RN 86 Hermes"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- assertVisible: "RN initial none"\n- assertVisible: "RN URL none"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"');
  if (expo) flow('expo-default-modules', expoAction('Expo native modules', 'Expo created 1 destroyed 0 URLs 0 activities 0') + '\n' + expoAction('Expo write file', 'Expo file saved') + '\n' + expoAction('Expo read file', 'Expo file preserved') + '\n' + expoAction('Expo app callbacks', 'Expo callbacks once'));
  run('default-deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/default']);
  flow('default-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 1"\n- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/default"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  flow('default-view', '- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- tapOn: "Check denied capability"\n- assertVisible: "Tauri capability denied location watch"\n- tapOn: "Hide Tauri view"\n- assertVisible: "View detached"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  const defaultIntegration = { pid, overriddenHooks: false, baseline: report('runtime-report.json'), binarySha256: sha256(readFileSync(path.join(app, info.CFBundleExecutable))) };
  assert(!existsSync(path.join(dataDirectory, 'react-lifecycle.json')), 'Pure generated application must not execute acceptance telemetry');
  const coldIntegration = launchURL('cold-initial', 'tauri-fieldnotes://notes/cold', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN initial tauri-fieldnotes://notes/cold"\n- assertVisible: "RN links 0 back 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  run('cold-next-url', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/cold-next']);
  flow('cold-next-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN links 1 back 0"\n- assertVisible: "RN URL tauri-fieldnotes://notes/cold-next"\n- tapOn: "Check initial URL"\n- assertVisible: "Initial API tauri-fieldnotes://notes/cold"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 0 setup 1 plugins 1"');
  assert(!existsSync(path.join(dataDirectory, 'react-lifecycle.json')));
  if (expo) {
    flow('expo-default-permission', expoAction('Expo request permission', 'Expo permission granted', '- tapOn: "(Allow While Using App|앱을 사용하는 동안 허용)"\n') + '\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 2"');
    expoDefaultPermissions = report('notes.json'); assert.equal(expoDefaultPermissions.length, 1);
  }
  assert.deepEqual(packedReader(copied), manifest);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')));
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'ios', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'React Native/codegen 0.86.3 / Hermes / generated TurboModule and Fabric', architectures: ['arm64'], expo, cng: cngResult ? { scenarios: cngResult.generationScenarios, files: cngResult.files, nativeProbe: cngNativeProbe } : false, layout: nativeProject ? 'native-project' : 'container', sourceFree: true, sourceFreeBuild: `PATH=${buildEnv.PATH} xcodebuild -configuration ${configuration} -sdk iphonesimulator`,
    packageSha256: packed.sha256, packageSource: packed.source, artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    binarySha256: acceptanceBinarySha256, composition: receipt, podIntegration, defaultIntegration, coldIntegration, coldRemount, coldRemounted, delayedStartup, activityRouting, bundleSha256: sha256(readFileSync(bundle)), baseline, denied, permissionRetired, saved, remounted, viewIntegration, closed, notes, expoPermissions, expoDefaultPermissions,
    uiScenarios: ['original Tauri document embedded without replacement or reload', 'original frontend and RN share real notes/events/ACL', 'competing view rejected without detaching the first', 'component remount and engine replacement restore the original WebView and native clients', 'shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'renderer retirement during pending OS permission prevents the old continuation save', 'undeclared session preserves original caller_denied code/message', 'save and event', 'background deep link and event', 'RN Linking exact URL once per invocation including repeated identical URLs', 'URL during delayed renderer startup stays an event and does not become the initial URL', 'injected native browsing/unrelated activity preserves Tauri return values and does not duplicate restoration callbacks', 'cold URL reaches getInitialURL across renderer replacement and a later foreground URL event', 'original AppDelegate URL callbacks restored after RN removal', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'removing RN terminates its JS thread and preserves the independent original Tauri frontend'],
    testOnlyIntegration: 'Acceptance subclass supplies layout, baseline readiness and telemetry; the packed composer/SDK own startup, notification observation, readiness and attachment. A second Release app executes the unmodified generated startup/default layout with no acceptance subclass. Original Tauri UIApplication delegate preserved. Optional Expo execution uses installed native modules and an autolinked local subscriber probe; memory-warning/background-fetch callbacks are injected through the original delegate, while location permissions use the OS. CNG, broader third-party modules and OS universal-link association remain open. Cold-start URL proof also uses the default generated app without a launchApp step.',
  }, null, 2) + '\n');
  console.log(`PASS: packed RN retained iOS SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
