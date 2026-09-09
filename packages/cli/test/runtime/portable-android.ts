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
const evidence = path.join(root, 'target/retained-portability');
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const producer = path.join(evidence, 'ordinary producer');
const exported = path.join(evidence, 'exported-runtime');
const consumer = path.join(evidence, 'ABI 3 consumer with spaces');
const android = path.join(consumer, 'android');
const device = process.env.ANDROID_SERIAL;
assert(device, 'Select an Android arm64 emulator with ANDROID_SERIAL');
assert(process.argv[2] === undefined || process.argv[2] === '--consume', 'Use --consume only to retry the existing exported artifact after source deletion');
const appId = 'dev.taurinative.mobilefieldnotes';
const original = snapshot(fixture);
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target'), NODE_OPTIONS: '' };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;

function run(label: string, command: string, args: string[], cwd = evidence, environment: NodeJS.ProcessEnv = env) {
  console.log(`> portable-android: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'adb' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function report(name = 'native-plugins-report.json') {
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
  writeFileSync(file, `appId: ${appId}\n---\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
}
function stop() { run('stop', 'adb', ['-s', device!, 'shell', 'am', 'force-stop', appId]); }
function launch() { run('launch', 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]); }

try {
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  if (!process.argv[2]) {
    rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
    run('dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], producer);
    const before = snapshot(producer);
    writeFileSync(path.join(evidence, 'callers.json'), JSON.stringify({ version: 1, callers: { native: { webview: 'main', commands:
      ['snapshot', 'plugin_snapshot', 'list_notes', 'save_note', 'plugin:geolocation|check_permissions', 'plugin:geolocation|request_permissions',
        'plugin:geolocation|get_current_position', 'plugin:geolocation|watch_position', 'plugin:deep-link|get_current'] } } }, null, 2) + '\n');
    run('export', process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'export', 'android', '--runtime', 'retained',
      '--tauri-dir', path.join(producer, 'src-tauri'), '--caller-policy', path.join(evidence, 'callers.json'), '--targets', 'aarch64', '--debug', '--output-dir', exported]);
    assert.deepEqual(snapshot(producer), before);
    rmSync(producer, { recursive: true });
  }
  assert(!existsSync(producer), 'Delete the disposable producer before source-free consumer acceptance');
  const manifest = readRetainedArtifacts(exported);
  assert.equal(manifest.bootstrap.applicationId, appId);
  assert.equal(manifest.profile, 'debug', 'This run-as evidence gate requires a Debug app');
  rmSync(consumer, { recursive: true, force: true }); cpSync(exported, consumer, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(consumer), manifest, 'Relocation preserves the complete receipt');
  const diagnosis = JSON.parse(run('source-free-doctor', process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'doctor', '--artifacts', consumer, '--platform', 'android', '--json'], evidence,
    { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }));
  assert.equal(diagnosis.ok, true);
  const java = path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes');
  // Only the consumer owns this test UI; exported producer code and Rust stay unchanged.
  for (const [source, destination] of [['PluginActivity.kt.fixture', 'MainActivity.kt'], ['PluginAcceptance.java.fixture', 'PluginAcceptance.java']]) {
    cpSync(path.join(root, 'packages/cli/test/runtime/composition/android', source!), path.join(java, destination!));
  }
  run('source-free-build', './gradlew', ['--no-daemon', 'assembleDebug'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const apk = path.join(android, 'app/build/outputs/apk/debug/app-debug.apk');
  const buildTools = path.join(process.env.ANDROID_HOME!, 'build-tools');
  const zipalign = readdirSync(buildTools).filter(version => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).map(version => path.join(buildTools, version, 'zipalign')).find(existsSync);
  assert(zipalign, 'APK acceptance requires installed Android build-tools zipalign');
  run('apk-alignment', zipalign, ['-c', '-P', '16', '-v', '4', apk]);
  run('install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  launch(); await until(() => typeof report('runtime-report.json').passed === 'boolean');
  const baseline = report('runtime-report.json');
  assert.equal(baseline.passed, true, JSON.stringify(baseline));
  flow('initial-native', '- assertVisible: "Native ready"\n- tapOn: "Native check permission"\n- assertVisible: "Native permission prompt"\n- tapOn: "Native deny capability"\n- assertVisible: "Native capability denied"');
  const acl = report();
  flow('deny-native-permission', '- tapOn: "Native request permission"\n- tapOn: "(?i)Don.t allow"\n- assertVisible: "Native permission prompt-with-rationale"');
  const denied = report();
  flow('native-denied-position', '- tapOn: "Native save location"\n- assertVisible: "Native location denied"');
  const deniedPosition = report();
  assert.equal(deniedPosition.result.ok, false);
  assert.match(JSON.stringify(deniedPosition.result.error), /android\.permission\.ACCESS_(?:COARSE|FINE)_LOCATION/);
  flow('native-no-denied-save', '- tapOn: "Native refresh"\n- assertVisible: "Native links 0 notes 0"');
  stop();
  for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) run(`reset-${permission}`, 'adb', ['-s', device, 'shell', 'pm', 'clear-permission-flags', appId, `android.permission.${permission}`, 'user-set', 'user-fixed']);
  launch();
  flow('retire-native-permission', '- assertVisible: "Native ready"\n- tapOn: "Native retire permission"\n- assertVisible: "(?i)While using the app"');
  await until(() => report().action === 'retired' && report().generation === 2);
  flow('grant-retired-permission', '- tapOn: "(?i)While using the app"\n- tapOn: "Native check permission"\n- assertVisible: "Native permission granted"');
  const granted = report(); assert.equal(granted.retiredCallbacks, 0); assert.equal(granted.retiredClosures, 1, 'A pending request is explicitly settled as session_closed before the OS grant');
  flow('native-save', '- tapOn: "Native save location"\n- assertVisible: "Native note 1"');
  const saved = report();
  assert.equal(saved.result.text, 'A native place to remember');
  assert(Math.abs(saved.result.latitude - 37.5665) < 0.01 && Math.abs(saved.result.longitude - 126.978) < 0.01);
  flow('native-background', '- pressKey: Home');
  const link = 'tauri-fieldnotes://notes/1';
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', link, '-p', appId]);
  flow('native-link', '- tapOn: "Native refresh"\n- assertVisible: "Native links 1 notes 1"\n- tapOn: "Native remount"\n- tapOn: "Native refresh"\n- assertVisible: "Native links 1 notes 1"');
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
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'android', formatVersion: 2, abiVersion: 3,
    profile: 'debug', target: 'arm64 16 KB emulator', producerDeleted: true, producerUnchanged: true, sourceHashes: original,
    sourceFreeBuild: './gradlew --no-daemon assembleDebug; PATH=/usr/bin:/bin:/usr/sbin:/sbin; relocated path has spaces', apkAlignment: 'zipalign -c -P 16 -v 4 passed',
    consumer: 'Native Android acceptance UI; RN/Lynx package acceptance remains separate',
    artifactSha256: sha256(readFileSync(path.join(exported, 'manifest.json'))), apkSha256: sha256(readFileSync(apk)),
    baseline, acl, denied, deniedPosition, granted, saved, linked, relaunched,
  }, null, 2) + '\n');
  console.log('PASS: source-free ABI 3 Android bootstrap, native Kotlin plugins, permission callback retirement, deep link and persistence');
} finally {
  try { if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]); }
  finally { release(); assert.deepEqual(snapshot(fixture), original, 'The ordinary checked-in Tauri producer stays unchanged'); }
}
