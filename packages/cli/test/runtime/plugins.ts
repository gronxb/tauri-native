import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';
import { retainedEvidence } from '../../../../scripts/retained-test-inputs.ts';
import { inventory, sha256 } from '../../src/artifacts/files.ts';
import type { StandalonePrepared } from '../../../../scripts/validation-types.ts';

const requested = process.argv[2];
assert(requested === 'ios' || requested === 'android', 'Select ios or android');
const platform: 'ios' | 'android' = requested;
const flags = new Set(process.argv.slice(3));
assert([...flags].every(flag => ['--build-only', '--consume'].includes(flag)), 'Use --build-only or --consume');
const buildOnly = flags.has('--build-only'), consume = flags.has('--consume');
assert(!(buildOnly && consume), 'Build and consumption are separate stages');
const target = process.env.RETAINED_EXPORT_TARGETS ?? (platform === 'ios' ? 'aarch64-sim' : 'aarch64');
assert(platform === 'ios' ? target === 'aarch64-sim' : ['aarch64', 'x86_64'].includes(target), 'Select a verified CI simulator/emulator target');
const device = platform === 'ios' ? process.env.IOS_SIMULATOR_UDID : process.env.ANDROID_SERIAL;
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const evidence = retainedEvidence(root, `tauri-mobile-plugins/standalone-${platform}`);
const preparedDirectory = path.resolve(process.env.RETAINED_STANDALONE_INPUT ?? path.join(evidence, 'prepared'));
assert(!process.env.RETAINED_STANDALONE_INPUT || consume, 'An external baseline is only accepted with --consume');
const producer = path.join(evidence, 'producer');
let commandCwd = producer;
const appId = 'dev.taurinative.mobilefieldnotes';
const original = snapshot(fixture);
const releaseMobileTest = acquireMobileTest(root);
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target'), NODE_OPTIONS: '',
  ...(platform === 'android' ? { RUSTFLAGS: '-C link-arg=-landroid -C link-arg=-llog -C link-arg=-lOpenSLES -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384' } : {}),
};
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });

function run(label: string, command: string, args: string[]) {
  console.log(`> plugins-${platform}: ${label}`);
  const result = spawnSync(command, args, { cwd: commandCwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : ['adb', 'xcrun'].includes(command) ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function artifact(directory: string, matches: (file: string) => boolean) {
  const files = readdirSync(directory, { recursive: true, encoding: 'utf8' }).map(file => path.join(directory, file)).filter(matches);
  assert.equal(files.length, 1, `Expected one installable artifact: ${files}`);
  return files[0]!;
}

let dataDirectory: string;
function report(file = 'plugins-report.json') {
  if (platform === 'ios') return JSON.parse(readFileSync(path.join(dataDirectory, file), 'utf8'));
  const result = spawnSync('adb', ['-s', device!, 'exec-out', 'run-as', appId, 'cat', file], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Mobile plugin scenario did not complete');
    await setTimeout(300);
  }
}

function flow(label: string, steps: string) {
  const yaml = path.join(evidence, `${label}.yaml`);
  writeFileSync(yaml, `appId: ${appId}\n---\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`),
    '--debug-output', path.join(evidence, `${label}-maestro`), '--flatten-debug-output', yaml]);
}

function launch(label: string) {
  return platform === 'ios'
    ? run(label, 'xcrun', ['simctl', 'launch', device!, appId])
    : run(label, 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
}

function stop(label: string) {
  if (platform === 'ios') run(label, 'xcrun', ['simctl', 'terminate', device!, appId]);
  else run(label, 'adb', ['-s', device!, 'shell', 'am', 'force-stop', appId]);
}

let installed = false;
function prepareNative(): StandalonePrepared {
  rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
  rmSync(preparedDirectory, { recursive: true, force: true }); mkdirSync(preparedDirectory, { recursive: true });
  run('dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const before = snapshot(producer);
  assert.deepEqual(before, original);
  run('init', 'npm', ['run', 'tauri', '--', platform, 'init', '--ci', '--skip-targets-install']);
  // Refresh native build-script side effects after ordinary scaffold generation.
  run('refresh-native-codegen', 'cargo', ['clean', '--package', 'tauri', '--package', 'tauri-plugin-geolocation',
    '--package', 'tauri-plugin-deep-link', '--target', platform === 'ios' ? 'aarch64-apple-ios-sim' : `${target === 'aarch64' ? 'aarch64' : 'x86_64'}-linux-android`,
    '--manifest-path', 'src-tauri/Cargo.toml']);
  let binary: string, executable: string;
  if (platform === 'ios') {
    run('build', 'npm', ['run', 'tauri', '--', 'ios', 'build', '--ci', '--debug', '--target', target, '--no-sign']);
    const app = artifact(path.join(producer, 'src-tauri/gen/apple/build'), file => file.endsWith('.app') && path.basename(path.dirname(file)) === 'arm64-sim');
    const info = JSON.parse(run('app-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Info.plist')]));
    assert.equal(info.NSLocationWhenInUseUsageDescription, 'Attach your current location to a note when you request it.');
    assert(info.CFBundleURLTypes?.some((type: { CFBundleURLSchemes: string[] }) => type.CFBundleURLSchemes.includes('tauri-fieldnotes')),
      'Native plugin build must preserve the configured deep-link URL scheme after scaffold regeneration');
    binary = 'standalone.app'; executable = `${binary}/${info.CFBundleExecutable}`;
    cpSync(app, path.join(preparedDirectory, binary), { recursive: true, dereference: true });
  } else {
    run('build', 'npm', ['run', 'tauri', '--', 'android', 'build', '--ci', '--debug', '--target', target, '--apk']);
    const apk = artifact(path.join(producer, 'src-tauri/gen/android/app/build/outputs/apk'), file => file.endsWith('-debug.apk'));
    binary = executable = 'standalone.apk'; cpSync(apk, path.join(preparedDirectory, binary));
  }
  assert.deepEqual(snapshot(producer), before);
  rmSync(producer, { recursive: true });
  const prepared = { schemaVersion: 1, passed: true, platform, target, binary, executable,
    binarySha256: sha256(readFileSync(path.join(preparedDirectory, executable))), files: inventory(preparedDirectory),
    producerDeleted: !existsSync(producer), producerUnchanged: true, sourceHashes: before };
  writeFileSync(path.join(preparedDirectory, 'prepared.json'), JSON.stringify(prepared, null, 2) + '\n');
  return prepared;
}

async function acceptNative(prepared: StandalonePrepared, verify: () => void) {
  assert(device, 'Select an IOS_SIMULATOR_UDID or ANDROID_SERIAL');
  const binary = path.join(preparedDirectory, prepared.binary);
  let bootId: string | undefined;
  if (platform === 'ios') {
    run('install', 'xcrun', ['simctl', 'install', device, binary]); installed = true;
    const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
    dataDirectory = path.join(container, 'Library/Application Support', appId);
    for (const file of ['runtime-report.json', 'plugins-report.json']) rmSync(path.join(dataDirectory, file), { force: true });
    run('privacy-reset', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
    run('gps', 'xcrun', ['simctl', 'location', device, 'set', '37.5665,126.9780']);
  } else {
    assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
    assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), prepared.target === 'aarch64' ? 'arm64-v8a' : 'x86_64');
    assert.equal(run('page-size', 'adb', ['-s', device, 'shell', 'getconf', 'PAGE_SIZE']), '16384');
    bootId = run('boot-id', 'adb', ['-s', device, 'shell', 'cat', '/proc/sys/kernel/random/boot_id']);
    run('install', 'adb', ['-s', device, 'install', binary]); installed = true;
    run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  }
  launch('launch');
  await until(() => report('runtime-report.json').passed === true);
  const baseline = report('runtime-report.json');
  flow('initial', '- tapOn: "Check location permission"\n- assertVisible: "Location permission prompt"\n- tapOn: "Check denied capability"\n- assertVisible: "Tauri capability denied location watch"');
  await until(() => report().action === '#deny');
  const acl = report();
  assert.equal(acl.ok, true); assert.equal(acl.snapshot.notes.length, 0);
  // Upstream Tauri reports Android's retryable first denial as prompt-with-rationale.
  const deniedState = platform === 'android' ? 'prompt-with-rationale' : 'denied';
  flow('deny-permission', `- tapOn: "Request location permission"\n- tapOn: "(?i)(Don.t allow|허용 안 함)"\n- assertVisible: "Location permission ${deniedState}"`);
  await until(() => report().action === '#request');
  const denied = report();
  assert.equal(denied.ok, true); assert.equal(denied.result, `Location permission ${deniedState}`);
  flow('denied-position', '- tapOn: "Save location note"');
  await until(() => report().action === '#save');
  const deniedPosition = report();
  assert.equal(deniedPosition.ok, false); assert.equal(deniedPosition.snapshot.notes.length, 0);
  stop('stop-before-permission-reset');
  if (platform === 'ios') run('reset-denied-permission', 'xcrun', ['simctl', 'privacy', device, 'reset', 'location', appId]);
  else for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    run(`reset-${permission}`, 'adb', ['-s', device, 'shell', 'pm', 'clear-permission-flags', appId, `android.permission.${permission}`, 'user-set', 'user-fixed']);
  }
  launch('permission-relaunch');
  flow('grant-permission', `- tapOn: "Request location permission"\n- tapOn: "${platform === 'ios' ? '(Allow While Using App|앱을 사용하는 동안 허용)' : '(?i)While using the app'}"\n- assertVisible: "Location permission granted"`);
  await until(() => report().action === '#request' && report().result === 'Location permission granted');
  const granted = report();
  flow('save', '- tapOn: "Save location note"\n- assertVisible: "Saved location note 1"');
  await until(() => report().action === '#save' && report().ok === true);
  const saved = report();
  assert.equal(saved.snapshot.notes.length, 1);
  const note = saved.snapshot.notes[0];
  assert.equal(note.text, 'A place to remember');
  assert(Math.abs(note.latitude - 37.5665) < 0.01 && Math.abs(note.longitude - 126.978) < 0.01, JSON.stringify(note));
  const backgroundPid = platform === 'android' ? run('pid-before-background', 'adb', ['-s', device, 'shell', 'pidof', appId]) : undefined;
  flow('background', '- pressKey: Home');
  if (platform === 'android') {
    assert.equal(run('boot-after-background', 'adb', ['-s', device, 'shell', 'cat', '/proc/sys/kernel/random/boot_id']), bootId, 'Emulator rebooted during the warm deep-link scenario');
    assert.equal(run('pid-after-background', 'adb', ['-s', device, 'shell', 'pidof', appId]), backgroundPid, 'Warm deep link requires the same background process');
  }
  const link = 'tauri-fieldnotes://notes/1';
  if (platform === 'ios') run('deep-link', 'xcrun', ['simctl', 'openurl', device, link]);
  else run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-p', appId]);
  flow('link-ui', (platform === 'ios' ? '- tapOn:\n    text: "(Open|열기)"\n    optional: true\n' : '') +
    '- assertVisible: "Links received 1"\n- tapOn: "Refresh notes and links"');
  await until(() => report().snapshot.links.length === 1);
  const linked = report();
  if (platform === 'android') assert.equal(run('pid-after-link', 'adb', ['-s', device, 'shell', 'pidof', appId]), backgroundPid, 'Deep link must resume the original process');
  assert.deepEqual(linked.snapshot.links, [link]);
  assert.equal(linked.snapshot.setupCount, 1); assert.equal(linked.snapshot.pluginSetupCount, 1);
  stop('stop'); launch('relaunch');
  flow('persistence-ui', '- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 0"');
  await until(() => report().snapshot.links.length === 0 && report().snapshot.notes.length === 1);
  const relaunched = report();
  assert.deepEqual(relaunched.snapshot.notes, saved.snapshot.notes);
  assert.equal(relaunched.snapshot.setupCount, 1); assert.equal(relaunched.snapshot.pluginSetupCount, 1);
  verify();
  assert(!existsSync(producer));
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform, mode: 'standalone Tauri Mobile',
    runtime: 'Tauri 2.11.5 / Wry', plugins: { geolocation: '2.3.3', deepLink: '2.4.10' },
    build: `Debug ${prepared.target}, standard Tauri CLI`, producerUnchanged: true, producerDeleted: true, sourceHashes: original,
    transferredBinarySha256: prepared.binarySha256, bootId, backgroundPid,
    scenarios: ['ordinary-runtime-baseline', 'tauri-capability-denial', 'os-permission-denial', 'denied-position-no-save',
      'os-permission-grant', 'native-position-callback', 'persist-location-note', 'background-deep-link-once', 'process-relaunch-persistence'],
    baseline, acl, denied, deniedPosition, granted, saved, linked, relaunched,
  }, null, 2) + '\n');
  console.log(`PASS: standalone ${platform} native plugins, OS permission callbacks, deep link and persistence. ${evidence}/report.json`);
}

try {
  const prepared = consume ? JSON.parse(readFileSync(path.join(preparedDirectory, 'prepared.json'), 'utf8')) as StandalonePrepared : prepareNative();
  assert.equal(prepared.schemaVersion, 1); assert.equal(prepared.passed, true); assert.equal(prepared.platform, platform);
  assert.equal(prepared.producerUnchanged, true); assert.equal(prepared.producerDeleted, true);
  assert.deepEqual(prepared.sourceHashes, original, 'Transferred baseline must use the current ordinary producer');
  assert.equal(prepared.binary, platform === 'ios' ? 'standalone.app' : 'standalone.apk');
  assert(prepared.files.some(file => file.path === prepared.executable), 'Executable must belong to the prepared app inventory');
  const verify = () => assert.deepEqual(inventory(preparedDirectory).filter(file => file.path !== 'prepared.json'), prepared.files);
  verify();
  assert.equal(sha256(readFileSync(path.join(preparedDirectory, prepared.executable))), prepared.binarySha256);
  commandCwd = evidence;
  if (buildOnly) console.log(`PASS: ordinary ${platform} app prepared and producer deleted; native execution remains separate`);
  else await acceptNative(prepared, verify);

} catch (error) {
  // Preserve the original app's last report before uninstalling a failed run.
  // This distinguishes an undelivered native event from a UI assertion failure.
  if (installed) for (const file of ['runtime-report.json', 'plugins-report.json']) {
    try { writeFileSync(path.join(evidence, `failure-${file}`), JSON.stringify(report(file), null, 2) + '\n'); }
    catch (diagnosticError) { console.error(`Could not preserve ${file}: ${diagnosticError}`); }
  }
  throw error;
} finally {
  if (installed) {
    if (platform === 'ios') run('uninstall', 'xcrun', ['simctl', 'uninstall', device!, appId]);
    else run('uninstall', 'adb', ['-s', device!, 'uninstall', appId]);
  }
  assert.deepEqual(snapshot(fixture), original, 'Ordinary producer remains unchanged even on failure');
  releaseMobileTest();
}
