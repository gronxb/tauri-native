import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../src/artifacts/files.ts';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const platform = process.argv[2];
assert(platform === 'android' || platform === 'ios', 'Select ios or android');
const evidence = path.join(root, platform === 'android' ? 'target/retained-portability' : 'target/retained-ios-portability');
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const producer = path.join(evidence, 'ordinary producer');
const exported = path.join(evidence, 'exported-runtime');
const consumer = path.join(evidence, 'ABI 3 consumer with spaces');
const android = path.join(consumer, 'android');
const device = platform === 'android' ? process.env.ANDROID_SERIAL : process.env.IOS_SIMULATOR_UDID;
assert(device, 'Select ANDROID_SERIAL or IOS_SIMULATOR_UDID for an arm64 virtual device');
const flags = new Set(process.argv.slice(3));
assert([...flags].every(flag => ['--consume', '--release'].includes(flag)), 'Use --consume for the existing artifact, and --release for an optimized native build');
const consume = flags.has('--consume');
const profile = flags.has('--release') ? 'release' : 'debug';
const appId = 'dev.taurinative.mobilefieldnotes';
const original = snapshot(fixture);
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target'), NODE_OPTIONS: '' };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let dataDirectory: string;
let binary: string;
let iosPid: number;
let incrementalAcceptance: { unchangedHit: true; invalidCapabilityRejected: true; previousArtifactPreserved: true } | undefined;

function run(label: string, command: string, args: string[], cwd = evidence, environment: NodeJS.ProcessEnv = env) {
  console.log(`> portable-${platform}: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : ['adb', 'xcrun'].includes(command) ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function report(name = 'native-plugins-report.json') {
  if (platform === 'ios') return JSON.parse(readFileSync(path.join(dataDirectory, name), 'utf8'));
  const result = spawnSync('adb', ['-s', device!, 'exec-out', 'run-as', appId, 'cat', name], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Retained native plugin scenario did not complete');
    await setTimeout(300);
  }
}
function flow(label: string, steps: string) {
  const file = path.join(evidence, `${label}.yaml`);
  // A fresh XCTest driver can background the app. Activate the same process;
  // an explicit empty permission map avoids Maestro's default automatic grants.
  const activate = platform === 'ios' ? '- launchApp:\n    stopApp: false\n    permissions: {}\n' : '';
  if (platform === 'ios') process.kill(iosPid, 0);
  writeFileSync(file, `appId: ${appId}\n---\n${activate}${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
  if (platform === 'ios') process.kill(iosPid, 0);
}
function stop() {
  if (platform === 'ios') run('stop', 'xcrun', ['simctl', 'terminate', device!, appId]);
  else run('stop', 'adb', ['-s', device!, 'shell', 'am', 'force-stop', appId]);
}
function launch() {
  if (platform === 'ios') {
    const launched = run('launch', 'xcrun', ['simctl', 'launch', device!, appId]);
    iosPid = Number(launched.match(/: (\d+)$/)?.[1]);
    assert(Number.isSafeInteger(iosPid) && iosPid > 0, launched);
  }
  else run('launch', 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
}

try {
  if (platform === 'android') {
    assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
    assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  }
  if (!consume) {
    rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
    run('dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], producer);
    const before = snapshot(producer);
    cpSync(new URL('./composition/fieldnotes-callers.json', import.meta.url), path.join(evidence, 'callers.json'));
    const exportArguments = [path.join(root, 'packages/cli/dist/index.mjs'), 'export', platform, '--runtime', 'retained',
      '--tauri-dir', path.join(producer, 'src-tauri'), '--caller-policy', path.join(evidence, 'callers.json'), '--targets', platform === 'android' ? 'aarch64' : 'aarch64-sim', ...(profile === 'debug' ? ['--debug'] : []), '--output-dir', exported, '--incremental'];
    run('export', process.execPath, exportArguments);
    const receipt = readFileSync(path.join(exported, 'manifest.json'), 'utf8');
    assert.match(run('incremental-hit', process.execPath, exportArguments), /Reused validated retained/);
    assert.equal(readFileSync(path.join(exported, 'manifest.json'), 'utf8'), receipt);
    const capability = path.join(producer, 'src-tauri/capabilities/main.json');
    const capabilityBytes = readFileSync(capability);
    try {
      const invalid = JSON.parse(capabilityBytes.toString('utf8'));
      invalid.permissions.push('core:nonexistent-retained-cache-proof');
      writeFileSync(capability, JSON.stringify(invalid, null, 2) + '\n');
      console.log(`> portable-${platform}: capability-cache-invalidation`);
      const rejected = spawnSync(process.execPath, exportArguments, { cwd: evidence, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
      const log = `${rejected.stdout ?? ''}\n${rejected.stderr ?? ''}`;
      writeFileSync(path.join(evidence, 'capability-cache-invalidation.log'), log);
      assert.equal(rejected.error, undefined, 'Capability rejection must finish, not time out');
      assert.notEqual(rejected.status, 0, 'Changed invalid capabilities must not reuse the cached app');
      assert.match(log, /Permission core:nonexistent-retained-cache-proof not found/);
      assert.equal(readFileSync(path.join(exported, 'manifest.json'), 'utf8'), receipt, 'Failed native build preserves the previously validated artifact');
      readRetainedArtifacts(exported);
    } finally { writeFileSync(capability, capabilityBytes); }
    incrementalAcceptance = { unchangedHit: true, invalidCapabilityRejected: true, previousArtifactPreserved: true };
    assert.deepEqual(snapshot(producer), before);
    rmSync(producer, { recursive: true });
  }
  assert(!existsSync(producer), 'Delete the disposable producer before source-free consumer acceptance');
  const manifest = readRetainedArtifacts(exported);
  assert.equal(manifest.platform, platform);
  assert.equal(manifest.bootstrap.applicationId, appId);
  assert.equal(manifest.profile, profile);
  rmSync(consumer, { recursive: true, force: true }); cpSync(exported, consumer, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(consumer), manifest, 'Relocation preserves the complete receipt');
  const diagnosis = JSON.parse(run('source-free-doctor', process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'doctor', '--artifacts', consumer, '--platform', platform, '--json'], evidence,
    { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }));
  assert.equal(diagnosis.ok, true);
  if (manifest.platform === 'android') {
    const java = path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes');
    // Only the consumer owns this test UI; exported producer code and Rust stay unchanged.
    for (const [source, destination] of [['PluginActivity.kt.fixture', 'MainActivity.kt'], ['PluginAcceptance.java.fixture', 'PluginAcceptance.java']]) {
      cpSync(path.join(root, 'packages/cli/test/runtime/composition/android', source!), path.join(java, destination!));
    }
    if (profile === 'release') {
      // Consumer-only telemetry permits run-as; Release compilation and R8 stay on.
      const gradle = path.join(android, 'app/build.gradle.kts');
      const source = readFileSync(gradle, 'utf8');
      assert(source.includes('getByName("release") {'));
      writeFileSync(gradle, source.replace('getByName("release") {', 'getByName("release") {\n            isDebuggable = true\n            signingConfig = signingConfigs.getByName("debug")'));
    }
    run('source-free-build', './gradlew', ['--no-daemon', profile === 'debug' ? 'assembleDebug' : 'assembleRelease'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
    const apk = path.join(android, `app/build/outputs/apk/${profile}/app-${profile}.apk`);
    binary = apk;
    const buildTools = path.join(process.env.ANDROID_HOME!, 'build-tools');
    const zipalign = readdirSync(buildTools).filter(version => /^\d+\.\d+\.\d+$/.test(version))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).map(version => path.join(buildTools, version, 'zipalign')).find(existsSync);
    assert(zipalign, 'APK acceptance requires installed Android build-tools zipalign');
    run('apk-alignment', zipalign, ['-c', '-P', '16', '-v', '4', apk]);
    run('install', 'adb', ['-s', device, 'install', apk]); installed = true;
    run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  } else {
    const ios = path.join(consumer, 'ios');
    const sessions = path.join(ios, 'Sources/TauriNativeRuntime');
    for (const file of ['PluginAcceptance.h', 'PluginAcceptance.mm']) cpSync(path.join(root, 'packages/cli/test/runtime/composition/ios', `${file}.fixture`), path.join(sessions, file));
    const session = path.join(sessions, 'TNRuntimeSession.mm');
    writeFileSync(session, readFileSync(session, 'utf8') + '\n#include "PluginAcceptance.mm"\n');
    const main = path.join(ios, 'Sources/ordinary-tauri-mobile-fieldnotes/main.mm');
    writeFileSync(main, '#import "../TauriNativeRuntime/PluginAcceptance.h"\n' + readFileSync(main, 'utf8').replace('ffi::start_app();', '[PluginAcceptance install];\n\tffi::start_app();'));
    const derived = path.join(evidence, 'consumer-derived-data');
    run('source-free-build', 'xcodebuild', ['-project', manifest.bootstrap.xcodeProject, '-scheme', manifest.bootstrap.target, '-configuration', profile,
      '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', derived, 'CODE_SIGNING_ALLOWED=NO', 'build'], ios, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
    const app = path.join(derived, `Build/Products/${profile}-iphonesimulator/Tauri Mobile Fieldnotes.app`);
    const info = JSON.parse(run('app-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')]));
    assert.equal(info.NSLocationWhenInUseUsageDescription, 'Attach your current location to a note when you request it.');
    assert(info.CFBundleURLTypes?.some((type: { CFBundleURLSchemes: string[] }) => type.CFBundleURLSchemes.includes('tauri-fieldnotes')));
    binary = path.join(app, info.CFBundleExecutable);
    run('install', 'xcrun', ['simctl', 'install', device, app]); installed = true;
    const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
    dataDirectory = path.join(container, 'Library/Application Support', appId);
    for (const file of ['runtime-report.json', 'native-plugins-report.json']) rmSync(path.join(dataDirectory, file), { force: true });
    run('privacy-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
    run('gps', 'xcrun', ['simctl', 'location', device, 'set', '37.5665,126.9780']);
  }
  launch(); await until(() => typeof report('runtime-report.json').passed === 'boolean');
  const baseline = report('runtime-report.json');
  assert.equal(baseline.passed, true, JSON.stringify(baseline));
  flow('initial-native', '- assertVisible: "Native ready"\n- tapOn: "Native check permission"\n- assertVisible: "Native permission prompt"\n- tapOn: "Native deny capability"\n- assertVisible: "Native capability denied"');
  const acl = report();
  assert.equal(acl.result.ok, false);
  assert.match(acl.result.error, /^(?:geolocation\.watch_position explicitly denied|Command plugin:geolocation\|watch_position not allowed by ACL)/);
  flow('deny-native-permission', `- tapOn: "Native request permission"\n- tapOn: "(?i)(Don.t allow|허용 안 함)"\n- assertVisible: "Native permission ${platform === 'android' ? 'prompt-with-rationale' : 'denied'}"`);
  const denied = report();
  flow('native-denied-position', '- tapOn: "Native save location"\n- assertVisible: "Native location denied"');
  const deniedPosition = report();
  assert.equal(deniedPosition.result.ok, false);
  assert.match(JSON.stringify(deniedPosition.result.error), platform === 'android' ? /android\.permission\.ACCESS_(?:COARSE|FINE)_LOCATION/ : /kCLErrorDomain error 1/);
  flow('native-no-denied-save', '- tapOn: "Native refresh"\n- assertVisible: "Native links 0 notes 0"');
  stop();
  if (platform === 'ios') run('reset-denied-permission', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  else for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) run(`reset-${permission}`, 'adb', ['-s', device, 'shell', 'pm', 'clear-permission-flags', appId, `android.permission.${permission}`, 'user-set', 'user-fixed']);
  launch();
  const grant = platform === 'android' ? '(?i)While using the app' : '(Allow While Using App|앱을 사용하는 동안 허용)';
  flow('retire-native-permission', `- assertVisible: "Native ready"\n- tapOn: "Native retire permission"\n- assertVisible: "${grant}"`);
  await until(() => report().action === 'retired' && report().generation === 2);
  flow('grant-retired-permission', `- tapOn: "${grant}"\n- tapOn: "Native check permission"\n- assertVisible: "Native permission granted"`);
  const granted = report(); assert.equal(granted.retiredCallbacks, 0); assert.equal(granted.retiredClosures, 1, 'A pending request is explicitly settled as session_closed before the OS grant');
  flow('native-save', '- tapOn: "Native save location"\n- assertVisible: "Native note 1"');
  const saved = report();
  assert.equal(saved.result.text, 'A native place to remember');
  assert(Math.abs(saved.result.latitude - 37.5665) < 0.01 && Math.abs(saved.result.longitude - 126.978) < 0.01);
  flow('native-background', '- pressKey: Home');
  const link = 'tauri-fieldnotes://notes/1';
  if (platform === 'ios') run('deep-link', 'xcrun', ['simctl', 'openurl', device, link]);
  else run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-p', appId]);
  flow('native-link', (platform === 'ios' ? '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n' : '') + '- tapOn: "Native refresh"\n- assertVisible: "Native links 1 notes 1"\n- tapOn: "Native remount"\n- tapOn: "Native refresh"\n- assertVisible: "Native links 1 notes 1"');
  const linked = report(); assert.deepEqual(linked.result.links, [link]);
  assert.equal(linked.generation, 3); assert.equal(linked.retiredCallbacks, 0);
  assert.equal(linked.result.setupCount, 1); assert.equal(linked.result.pluginSetupCount, 1);
  assert.equal(linked.pid, saved.pid);
  stop(); launch();
  flow('native-persistence', '- assertVisible: "Native ready"\n- tapOn: "Native refresh"\n- assertVisible: "Native links 0 notes 1"');
  const relaunched = report();
  assert.deepEqual(relaunched.result.notes, [saved.result]);
  assert.equal(relaunched.result.setupCount, 1); assert.equal(relaunched.result.pluginSetupCount, 1);
  assert.deepEqual(readRetainedArtifacts(exported), manifest, 'Consumer integration preserves the original published artifact');
  assert(!existsSync(producer));
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform, formatVersion: 2, abiVersion: 3,
    profile, target: platform === 'android' ? 'arm64 16 KB emulator' : 'arm64 simulator', producerDeleted: true, producerUnchanged: true, sourceHashes: original,
    sourceFreeBuild: `${platform === 'android' ? `./gradlew --no-daemon assemble${profile === 'debug' ? 'Debug' : 'Release'}` : `xcodebuild -configuration ${profile} -sdk iphonesimulator`}; PATH=/usr/bin:/bin:/usr/sbin:/sbin; relocated path has spaces`,
    ...(platform === 'android' && profile === 'release' ? { testOnlySigning: 'Release/R8 with debug test key and android:debuggable for run-as telemetry; exported project unchanged' } : {}),
    ...(platform === 'android' ? { apkAlignment: 'zipalign -c -P 16 -v 4 passed' } : {}),
    consumer: 'Native platform acceptance UI; RN/Lynx package acceptance remains separate',
    artifactSha256: sha256(readFileSync(path.join(exported, 'manifest.json'))), binarySha256: sha256(readFileSync(binary)),
    incrementalAcceptance, baseline, acl, denied, deniedPosition, granted, saved, linked, relaunched,
  }, null, 2) + '\n');
  console.log(`PASS: source-free ABI 3 ${platform} bootstrap, native plugins, permission callback retirement, deep link and persistence`);
} finally {
  try { if (installed) {
    if (platform === 'ios') run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appId]);
    else run('uninstall', 'adb', ['-s', device, 'uninstall', appId]);
  } }
  finally { release(); assert.deepEqual(snapshot(fixture), original, 'The ordinary checked-in Tauri producer stays unchanged'); }
}
