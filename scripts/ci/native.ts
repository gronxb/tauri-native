import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildAndInstallTestHost, hostProfiles } from '../../packages/cli/test/native-export/host-build.ts';
import { inventory } from '../../packages/cli/src/artifacts/files.ts';
import { digest, json, output, readInput, record, root, run } from './common.ts';

const platform = process.argv[2];
assert(platform === 'ios' || platform === 'android', 'Usage: node --experimental-strip-types scripts/ci/native.ts ios|android');
const settings = json<import('../validation-types.ts').HostSettings>(path.join(output, 'hosts.json'));
const receipt = readInput(settings.FIELDNOTES_PACKAGES);
const hostEnv = { ...process.env, ...settings, PATH: settings.NATIVE_HOST_PATH };
const devices = { ios: process.env.IOS_SIMULATOR_UDID, android: process.env.ANDROID_SERIAL };
assert(devices[platform]!, 'Select the job-owned device');
const reportFile = path.join(output, `native-${platform}.json`);
rmSync(reportFile, { force: true });
if (platform === 'android') process.on('exit', code => {
  if (code === 0) return;
  try { run('android-failure-logcat', 'adb', ['-s', devices.android!, 'logcat', '-b', 'all', '-d', '-t', '2000'], root, hostEnv); }
  catch (error) { console.error(`Could not collect final Android system logs: ${error instanceof Error ? error.message : String(error)}`); }
});
let androidStorage;
if (platform === 'android') {
  const pageSize = run('android-page-size', 'adb', ['-s', devices.android!, 'shell', 'getconf', 'PAGE_SIZE'], root, hostEnv).trim();
  assert.equal(pageSize, '16384', 'Native acceptance requires the 16 KB emulator');
  const storage = run('android-storage', 'adb', ['-s', devices.android!, 'shell', 'df', '-k', '/data'], root, hostEnv);
  run('android-memory', 'adb', ['-s', devices.android!, 'shell', 'cat', '/proc/meminfo'], root, hostEnv);
  const availableKiB = Number(storage.trim().split('\n').at(-1)!.trim().split(/\s+/)[3]);
  assert(availableKiB >= 1024 * 1024, 'The CI emulator needs at least 1 GiB free for Release app installation; configure its data disk before building');
  androidStorage = { availableKiB, pageSize: Number(pageSize) };
}
const checks = [], features = [];
for (const changed of [false, true]) {
  const name = changed ? 'feature-changed' : 'feature';
  run(name, process.execPath, ['--experimental-strip-types', 'packages/cli/test/feature/run.ts'], root,
    { ...hostEnv, FIELDNOTES_PLATFORM: platform, FIELDNOTES_CHANGED_RUST: changed ? '1' : '0' });
  const report = json<import('../validation-types.ts').FeatureReceipt>(path.join(root, `target/document-${name}/native-report.json`));
  assert.equal(report.passed, true);
  assert.deepEqual(report.results.map(item => item.host).sort(), ['expo', 'lynx', 'rn']);
  for (const item of report.results) {
    assert.equal(item.platform, platform); assert.equal(item.passed, true);
    const sdk = item.host === 'lynx' ? 'lynx' : 'react-native';
    assert.equal(item.packageSha256, receipt.packages.find(packed => packed.sdk === sdk)!.sha256);
    if (changed) assert.equal(item.abandonment.length, 2);
  }
  features.push(report); checks.push(name);
}
const profiles = hostProfiles.filter(profile => profile.name !== 'expo')
  .map(profile => ({ ...profile, directory: settings[profile.hostVariable] }));
for (const [mode, exported] of [['async', 'async-protocol'], ['view', 'view-events']] as const) {
  run(`prepare-${mode}`, process.execPath, [`scripts/prepare-${mode}-hosts.ts`, settings.RN_HOST, settings.LYNX_HOST], root, hostEnv);
  const flow = path.join(output, `${mode}-contract.yaml`);
  writeFileSync(flow, readFileSync(path.join(root, 'scripts', `${mode}-contract.yaml`), 'utf8')
    .replace('appId: ${APP_ID}', 'appId: ${APP_ID}\nandroidWebViewHierarchy: devtools'));
  for (const profile of profiles) {
    assert.deepEqual(inventory(path.join(profile.directory, 'tauri-native', platform)), inventory(path.join(root, 'target', exported, 'artifacts', platform)));
    buildAndInstallTestHost(profile, platform, (label, ...args) => run(`${mode}-${label}`, ...args), hostEnv, devices);
    const label = `${mode}-${profile.name}`;
    const xml = path.join(output, `${label}-${platform}.xml`);
    rmSync(xml, { force: true });
    run(`${label}-${platform}-flow`, 'maestro', ['--udid', devices[platform]!, 'test', '-e', `APP_ID=${profile.appId}`, '--format', 'junit', '--output', xml,
      '--debug-output', path.join(output, `${label}-${platform}-maestro`), '--flatten-debug-output', flow], profile.directory, hostEnv);
    assert(existsSync(xml)); checks.push(label);
  }
}
let standalone;
if (platform === 'android') {
  run('standalone-android', process.execPath, ['packages/cli/test/native-export/android-device.ts', 'target/export-android/consumer-prepared.json'], root, hostEnv);
  standalone = json<import('../validation-types.ts').StandaloneReceipt>(path.join(root, 'target/export-android/report.json'));
  assert.equal(standalone.transferredApkSha256, receipt.androidPreparation.apkSha256);
  assert.equal(standalone.emulator.pageSize, 16384);
  checks.push('standalone-android');
}
const installedVersions = Object.fromEntries(hostProfiles.map(profile => [profile.name,
  Object.fromEntries((profile.name === 'lynx' ? ['@lynx-js/react', '@lynx-js/lynx-ui'] : ['react-native', ...(profile.name === 'expo' ? ['expo'] : [])])
    .map(name => [name, json<import('../validation-types.ts').PackageManifest>(path.join(settings[profile.hostVariable], 'node_modules', name, 'package.json')).version]))]));
record(reportFile, { schemaVersion: 1, commit: receipt.commit, platform, passed: true, checks, features, standalone, installedVersions,
  producerReceiptSha256: digest(path.join(settings.FIELDNOTES_PACKAGES, 'producer.json')),
  packages: receipt.packages, lynxAndroidMinified: platform === 'android', device: devices[platform]!,
  lynxR8MappingSha256: platform === 'android' ? digest(path.join(settings.LYNX_HOST, 'android/app/build/outputs/mapping/release/mapping.txt')) : undefined,
  androidStorage,
});
console.log(`PASS: candidate consumers, lifecycle and ${platform} runtime gates. ${reportFile}`);
