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
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-ios-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'ios' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
const device = process.env.IOS_SIMULATOR_UDID;
assert(device, 'Choose an arm64 IOS_SIMULATOR_UDID');
const evidence = path.join(root, 'target/react-retained-ios');
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const ios = path.join(consumer, 'ios');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' };
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
async function launch() {
  for (const file of ['runtime-report.json', 'react-lifecycle.json']) rmSync(path.join(dataDirectory, file), { force: true });
  const result = run('launch', 'xcrun', ['simctl', 'launch', device!, appId]);
  pid = Number(result.match(/: (\d+)$/)?.[1]);
  assert(Number.isSafeInteger(pid) && pid > 0, result);
  await until(() => report('runtime-report.json').passed === true && report().pid === pid);
}
try {
  rmSync(consumer, { recursive: true, force: true }); cpSync(artifact, consumer, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(consumer), manifest);
  run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages/react-native'));
  run('unpack', 'tar', ['-xzf', 'tauri-native-react-native-1.0.0-rc.0.tgz']);
  const sdk = path.join(consumer, 'package');
  mkdirSync(renderer, { recursive: true });
  symlinkSync(path.join(root, 'examples/react-native/node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/index.tsx.fixture', import.meta.url), path.join(renderer, 'index.tsx'));
  cpSync(new URL('./retained/build.cjs.fixture', import.meta.url), path.join(renderer, 'build.cjs'));
  writeFileSync(path.join(renderer, 'package.json'), '{"name":"packed-retained-rn-consumer","private":true}\n');
  writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
  run('renderer-build', process.execPath, ['build.cjs', 'ios'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_SDK_DIR: sdk });
  const bundle = path.join(renderer, 'index.bundle.js');
  mkdirSync(path.join(ios, 'assets'), { recursive: true }); cpSync(bundle, path.join(ios, 'assets/index.bundle.js'));
  const main = path.join(ios, 'Sources/ordinary-tauri-mobile-fieldnotes/main.mm');
  cpSync(new URL('./retained/IosAcceptance.mm.fixture', import.meta.url), path.join(path.dirname(main), 'IosAcceptance.mm'));
  const originalMain = readFileSync(main, 'utf8'); assert(originalMain.includes('ffi::start_app();'));
  writeFileSync(main, '#import "IosAcceptance.mm"\n' + originalMain.replace('ffi::start_app();', '@autoreleasepool { [TNReactAcceptance install]; }\n\tffi::start_app();'));
  const reactNative = path.dirname(createRequire(path.join(renderer, 'package.json')).resolve('react-native/package.json'));
  assert.equal(JSON.parse(readFileSync(path.join(reactNative, 'package.json'), 'utf8')).version, '0.86.3');
  writeFileSync(path.join(ios, '.xcode.env'), `export NODE_BINARY=${JSON.stringify(process.execPath)}\n`);
  writeFileSync(path.join(ios, 'Podfile'), `ENV['RCT_USE_RN_DEP'] = '1'
ENV['RCT_USE_PREBUILT_RNCORE'] = '1'
require ${JSON.stringify(path.join(reactNative, 'scripts/react_native_pods'))}
require_relative '../package/ios/retained/pods'
platform :ios, '16.4'
prepare_react_native_project!
rn = ${JSON.stringify(reactNative)}
TauriNativeReactRetained.prepare(rn, ${JSON.stringify(process.execPath)})
project '${manifest.bootstrap.xcodeProject}', 'debug' => :debug, 'release' => :release
target '${manifest.bootstrap.target}' do
  use_react_native!(:path => rn, :app_path => ${JSON.stringify(renderer)})
  pod 'TauriNativeReactRetained', :path => '../package/ios'
end
post_install do |installer|
  react_native_post_install(installer, rn, :mac_catalyst_enabled => false)
  TauriNativeReactRetained.post_install(installer, '${manifest.bootstrap.target}')
end
`);
  run('pods', 'pod', ['install'], ios);
  const workspace = manifest.bootstrap.xcodeProject.replace(/\.xcodeproj$/, '.xcworkspace');
  const derived = path.join(evidence, 'derived-data');
  run('source-free-build', 'xcodebuild', ['-workspace', workspace, '-scheme', manifest.bootstrap.target, '-configuration', 'release', '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', 'IPHONEOS_DEPLOYMENT_TARGET=16.4', 'build'], ios, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const app = path.join(derived, 'Build/Products/release-iphonesimulator/Tauri Mobile Fieldnotes.app');
  const info = JSON.parse(run('app-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')]));
  assert.equal(info.MinimumOSVersion, '16.4');
  assert.equal(info.NSLocationWhenInUseUsageDescription, 'Attach your current location to a note when you request it.');
  assert(info.CFBundleURLTypes?.some((item: { CFBundleURLSchemes: string[] }) => item.CFBundleURLSchemes.includes('tauri-fieldnotes')));
  run('install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
  const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(container, 'Library/Application Support', appId);
  run('privacy-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  run('gps', 'xcrun', ['simctl', 'location', device, 'set', '37.5665,126.9780']);
  await launch();
  const baseline = report('runtime-report.json');
  flow('initial', '- assertVisible: \"RN 86 Hermes\"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(Don.t Allow|허용 안 함)"\n- assertVisible: "Permission denied"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "RN events 0"');
  const denied = report();
  run('stop-denied', 'xcrun', ['simctl', 'terminate', device, appId]);
  run('reset-denied', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  await launch();
  flow('grant-permission', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Request permission"\n- tapOn: "(Allow While Using App|앱을 사용하는 동안 허용)"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "RN note 1"\n- assertVisible: "RN events 1"');
  const saved = report(); assert.equal(saved.listeners, 1); assert.equal(saved.reactThreads.length, 1);
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > saved.stopped);
  run('deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1']);
  flow('resume', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "RN events 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  await until(() => report().reactThreads.length === 1);
  const remounted = report();
  assert.equal(remounted.pid, saved.pid); assert.equal(remounted.generation, 2);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert.equal(remounted.appDelegate, 'AppDelegate'); assert(remounted.stopped >= 1 && remounted.resumed > saved.resumed);
  run('remounted-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1?remounted=1']);
  flow('fresh-events', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "RN events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  const notes = report('notes.json'); assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'A RN place to remember');
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close RN"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 2"');
  await until(() => report().reactThreads.length === 0);
  const closed = report(); assert.equal(closed.hostClosed, true); assert.equal(closed.listeners, 0);
  assert.equal(closed.pid, saved.pid); assert.equal(closed.appDelegate, saved.appDelegate);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')));
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'ios', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'React Native/codegen 0.86.3 / Hermes / generated TurboModule and Fabric', sourceFree: true, sourceFreeBuild: 'PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -configuration release -sdk iphonesimulator',
    packageSha256: sha256(readFileSync(path.join(consumer, 'tauri-native-react-native-1.0.0-rc.0.tgz'))), artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    binarySha256: sha256(readFileSync(path.join(app, info.CFBundleExecutable))), bundleSha256: sha256(readFileSync(bundle)), baseline, denied, saved, remounted, closed, notes,
    uiScenarios: ['shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'save and event', 'background deep link and event', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'removing RN terminates its JS thread and preserves the independent original Tauri frontend'],
    testOnlyIntegration: 'Consumer fixture layout and pre-start notification registration; actual packed SDK owns module, renderer and session lifetime. Original Tauri UIApplication delegate preserved. Automatic composition/autolinking, Expo and RN Linking URL forwarding remain open.',
  }, null, 2) + '\n');
  console.log(`PASS: packed RN retained iOS SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
