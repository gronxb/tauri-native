import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../cli/src/artifacts/files.ts';
import { acquireMobileTest } from '../../cli/test/runtime/mobile-lock.ts';
import { assertOriginalDocument, verifyRetainedView } from './retained/view-scenarios.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-ios-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'ios' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
const device = process.env.IOS_SIMULATOR_UDID;
assert(device, 'Choose an arm64 IOS_SIMULATOR_UDID');
const evidence = path.join(root, 'target/lynx-retained-ios');
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const generated = path.join(consumer, 'composed application');
const ios = path.join(generated, 'ios');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true }); rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let pid = 0, dataDirectory = '';
function run(label: string, command: string, args: string[], cwd = consumer, environment = env) {
  console.log(`> lynx-retained-ios: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'xcrun' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}; full output: ${evidence}/${label}.log\n${result.stdout?.slice(-6000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout.trim();
}
function report(name = 'lynx-lifecycle.json') { return JSON.parse(readFileSync(path.join(dataDirectory, name), 'utf8')); }
async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    process.kill(pid, 0);
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Lynx retained scenario did not reach the expected state');
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
  for (const file of ['runtime-report.json', 'lynx-lifecycle.json']) rmSync(path.join(dataDirectory, file), { force: true });
  const result = run('launch', 'xcrun', ['simctl', 'launch', device!, appId]);
  pid = Number(result.match(/: (\d+)$/)?.[1]);
  assert(Number.isSafeInteger(pid) && pid > 0, result);
  await until(() => report('runtime-report.json').passed === true && report().pid === pid);
}
try {
  rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
  const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(copied), manifest);
  run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages/lynx'));
  run('unpack', 'tar', ['-xzf', 'tauri-native-lynx-1.0.0-rc.0.tgz']);
  const sdk = path.join(consumer, 'package');
  mkdirSync(path.join(renderer, 'src'), { recursive: true });
  symlinkSync(path.join(root, 'examples/lynx/node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/App.tsx.fixture', import.meta.url), path.join(renderer, 'src/App.tsx'));
  cpSync(path.join(root, 'packages/cli/test/runtime/composition/lynx/index.tsx.fixture'), path.join(renderer, 'src/index.tsx'));
  writeFileSync(path.join(renderer, 'package.json'), '{"name":"packed-retained-lynx-consumer","private":true,"type":"module"}\n');
  writeFileSync(path.join(renderer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@lynx-js/react', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
  writeFileSync(path.join(renderer, 'lynx.config.ts'), `import { defineConfig } from '@lynx-js/rspeedy';\nimport { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';\nexport default defineConfig({ plugins: [pluginReactLynx()], source: { alias: { '@tauri-native/lynx/retained': ${JSON.stringify(path.join(sdk, 'src/retained.ts'))} } } });\n`);
  run('renderer-build', path.join(renderer, 'node_modules/.bin/rspeedy'), ['build', '--mode', 'production'], renderer);
  const bundle = path.join(renderer, 'dist/main.lynx.bundle');
  const { composeIos } = createRequire(import.meta.url)(path.join(sdk, 'compose.cjs'));
  const { readRetainedArtifacts: packedReader } = createRequire(import.meta.url)(path.join(sdk, 'retained-artifacts.cjs'));
  assert.deepEqual(packedReader(copied), manifest);
  const options = { artifactsDir: copied, outputDir: generated, bundleFile: bundle };
  const composition = composeIos(options); assert.equal(composition.changed, true);
  assert.equal(composeIos(options).changed, false);
  const receipt = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  const main = path.join(ios, 'Sources/ordinary-tauri-mobile-fieldnotes/main.mm');
  const generatedMain = readFileSync(main, 'utf8');
  run('pods', 'pod', ['install'], ios);
  assert.equal(composeIos(options).changed, true, 'Regeneration accepts the recorded CocoaPods project and restores generated inputs');
  run('pods-regenerated', 'pod', ['install'], ios);
  const podIntegration = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  cpSync(new URL('./retained/IosAcceptance.mm.fixture', import.meta.url), path.join(path.dirname(main), 'IosAcceptance.mm'));
  writeFileSync(main, '#import "IosAcceptance.mm"\n' + generatedMain.replace('[TNLynxComposition installWithBundle:', '[TNLynxAcceptance installWithBundle:'));
  const workspace = composition.workspace;
  const derived = path.join(evidence, 'derived-data');
  run('source-free-build', 'xcodebuild', ['-workspace', workspace, '-scheme', manifest.bootstrap.target, '-configuration', 'release', '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', 'build'], ios, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const app = path.join(derived, 'Build/Products/release-iphonesimulator/Tauri Mobile Fieldnotes.app');
  const info = JSON.parse(run('app-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')]));
  assert.equal(info.MinimumOSVersion, composition.minimumOsVersion);
  assert.equal(info.NSLocationWhenInUseUsageDescription, 'Attach your current location to a note when you request it.');
  assert(info.CFBundleURLTypes?.some((item: { CFBundleURLSchemes: string[] }) => item.CFBundleURLSchemes.includes('tauri-fieldnotes')));
  run('install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
  const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(container, 'Library/Application Support', appId);
  run('privacy-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  run('gps', 'xcrun', ['simctl', 'location', device, 'set', '37.5665,126.9780']);
  await launch();
  const baseline = report('runtime-report.json');
  flow('initial', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(Don.t Allow|허용 안 함)"\n- assertVisible: "Permission denied"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"');
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
  flow('grant-permission', '- tapOn: "(Allow While Using App|앱을 사용하는 동안 허용)"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- tapOn: "Save location"\n- assertVisible: "Lynx note 1"\n- assertVisible: "Lynx events 1"');
  const saved = report(); assert.equal(saved.listeners, 1);
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > saved.stopped);
  run('deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1']);
  flow('resume', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "Lynx events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Remount Lynx"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  const remounted = report();
  assert.equal(remounted.pid, saved.pid); assert.equal(remounted.generation, 3);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert.equal(remounted.appDelegate, 'AppDelegate'); assert(remounted.stopped >= 1 && remounted.resumed > saved.resumed);
  run('remounted-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/1?remounted=1']);
  flow('fresh-events', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "Lynx events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  const view = verifyRetainedView(flow, report, evidence);
  const notes = report('notes.json'); assert.equal(notes.length, 2);
  assert.equal(notes[0].text, 'A Lynx place to remember');
  assert.equal(notes[1].text, 'A place to remember');
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close Lynx"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 2"');
  const closed = report(); assert.equal(closed.hostClosed, true); assert.equal(closed.listeners, 0);
  writeFileSync(path.join(evidence, 'view-closed.json'), JSON.stringify(closed, null, 2) + '\n');
  assertOriginalDocument(closed, false);
  assert.equal(closed.pid, saved.pid); assert.equal(closed.appDelegate, saved.appDelegate);
  const acceptanceBinarySha256 = sha256(readFileSync(path.join(app, info.CFBundleExecutable)));
  run('uninstall-acceptance', 'xcrun', ['simctl', 'uninstall', device, appId]); installed = false;
  writeFileSync(main, generatedMain); rmSync(path.join(path.dirname(main), 'IosAcceptance.mm'));
  run('default-source-free-build', 'xcodebuild', ['-workspace', workspace, '-scheme', manifest.bootstrap.target, '-configuration', 'release', '-sdk', 'iphonesimulator',
    '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', 'build'], ios, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  run('default-install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
  const defaultContainer = run('default-container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(defaultContainer, 'Library/Application Support', appId);
  const defaultLaunch = run('default-launch', 'xcrun', ['simctl', 'launch', device, appId]);
  pid = Number(defaultLaunch.match(/: (\d+)$/)?.[1]); assert(Number.isSafeInteger(pid) && pid > 0);
  await until(() => report('runtime-report.json').passed === true);
  flow('default-integration', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"');
  run('default-deep-link', 'xcrun', ['simctl', 'openurl', device, 'tauri-fieldnotes://notes/default']);
  flow('default-link', '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n- assertVisible: "Lynx events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  flow('default-view', '- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- tapOn: "Check denied capability"\n- assertVisible: "Tauri capability denied location watch"\n- tapOn: "Hide Tauri view"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  const defaultIntegration = { pid, overriddenHooks: false, baseline: report('runtime-report.json'), binarySha256: sha256(readFileSync(path.join(app, info.CFBundleExecutable))) };
  assert(!existsSync(path.join(dataDirectory, 'lynx-lifecycle.json')), 'Pure generated application must not execute acceptance telemetry');
  assert.deepEqual(packedReader(copied), manifest);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')));
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'ios', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'Lynx 4.0.1 / PrimJS 4.0.0', sourceFree: true, sourceFreeBuild: 'PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -configuration release -sdk iphonesimulator',
    packageSha256: sha256(readFileSync(path.join(consumer, 'tauri-native-lynx-1.0.0-rc.0.tgz'))), artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    binarySha256: acceptanceBinarySha256, composition: receipt, podIntegration, defaultIntegration, bundleSha256: sha256(readFileSync(bundle)), baseline, denied, permissionRetired, saved, remounted, closed, notes, view,
    uiScenarios: ['shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'renderer retirement during pending OS permission prevents the old continuation save', 'undeclared session preserves original caller_denied code/message', 'save and event', 'background deep link and event', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'removing Lynx preserves the independent original Tauri frontend', 'unmodified generated iOS startup/default layout', 'default SDK composition receives original Tauri deep-link events'],
    testOnlyIntegration: 'Acceptance subclass supplies layout, baseline readiness and telemetry; the packed composer/SDK own startup, notification observation, readiness and attachment. A second Release app executes the unmodified generated startup/default layout and retained TauriView with no acceptance subclass. Original Tauri UIApplication delegate preserved. Third-party autolinking and broader navigation/lifecycle forms remain open.',
  }, null, 2) + '\n');
  console.log(`PASS: packed Lynx retained iOS SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
