import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requiredChecks } from '../release-candidate.ts';
import { validateRetainedNative, validateRetainedProducer } from '../retained-validation.ts';
import type { Platform, ProducerReceipt, RetainedExportReceipt, RetainedNativeReceipt, RetainedProducerReceipt, StandalonePrepared } from '../validation-types.ts';

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value, null, 2) + '\n').digest('hex');
const producer: ProducerReceipt = { schemaVersion: 1, commit: 'a'.repeat(40), passed: true, exportsSha256: sha('legacy exports'),
  androidPreparation: { apkSha256: sha('legacy apk') },
  packages: ['cli', 'react-native', 'lynx'].map(sdk => ({ sdk, name: `@tauri-native/${sdk}`, version: '1.0.0-rc.0', file: `${sdk}.tgz`, sha256: sha(sdk) })),
};
const sourceHashes = { 'src-tauri/src/lib.rs': sha('ordinary source') };
function byPlatform<T>(make: (platform: Platform) => T): Record<Platform, T> {
  return { ios: make('ios'), android: make('android') };
}
const retained: RetainedProducerReceipt = {
  schemaVersion: 1, passed: true, commit: producer.commit, producerReceiptSha256: sha(producer), packages: producer.packages, archiveSha256: sha('retained exports'),
  desktop: { ordinary: { passed: true, producerUnchanged: true, sourceHashes }, retained: { passed: true, producerUnchanged: true, setupFailureObserved: true } },
  exports: byPlatform<RetainedExportReceipt>(platform => ({
    schemaVersion: 1, passed: true, platform, profile: 'release', targets: platform === 'ios' ? 'aarch64-sim' : 'x86_64',
    cliPackageSha256: producer.packages[0]!.sha256, producerDeleted: true, producerUnchanged: true, sourceHashes, originalFixtureHashes: sourceHashes,
    artifactSha256: sha(platform), formatVersion: 2, abiVersion: 3,
    native: platform === 'ios' ? [{ path: 'ios/runtime.a', variant: 'simulator', architectures: ['arm64'] }] : [{ path: 'android/runtime.so', abi: 'x86_64' }],
    incrementalAcceptance: { unchangedHit: true, invalidCapabilityRejected: true, previousArtifactPreserved: true },
  })),
  standalone: byPlatform<StandalonePrepared>(platform => ({
    schemaVersion: 1, passed: true, platform, target: platform === 'ios' ? 'aarch64-sim' : 'x86_64',
    binary: platform === 'ios' ? 'standalone.app' : 'standalone.apk', executable: platform === 'ios' ? 'standalone.app/app' : 'standalone.apk',
    binarySha256: sha(`ordinary ${platform}`), files: [{ path: platform === 'ios' ? 'standalone.app/app' : 'standalone.apk', sha256: sha(`ordinary ${platform}`), size: 123 }],
    producerDeleted: true, producerUnchanged: true, sourceHashes,
  })),
};

function native(platform: Platform): RetainedNativeReceipt {
  const rows: [string, number][] = [['standalone', 8], ['native', 12], ['react-native', platform === 'ios' ? 25 : 24], ['expo', platform === 'ios' ? 34 : 32], ['lynx', 17]];
  if (platform === 'android') for (const sdk of ['react', 'expo', 'lynx']) {
    const extra = sdk === 'expo' ? 4 : 0;
    rows.push([`${sdk}-recreation`, 5 + extra], [`${sdk}-fresh-permission`, 7 + extra], [`${sdk}-pending-permission`, 9 + extra]);
  }
  if (platform === 'android') rows.push(['react-rn-permission', 12], ['expo-rn-permission', 15], ['expo-expo-permission', 15],
    ['expo-cng-recreation', 9], ['expo-cng-fresh-permission', 11], ['expo-cng-pending-permission', 13], ['expo-cng-rn-permission', 15], ['expo-cng-expo-permission', 15]);
  return { schemaVersion: 1, passed: true, commit: producer.commit, platform, packages: producer.packages,
    producerReceiptSha256: sha(producer), retainedProducerSha256: sha(retained),
    gates: rows.map(([name, count]) => {
      const sdk = name.startsWith('lynx') ? 'lynx' : 'react-native';
      const scenario = name.replace('-cng-', '-');
      const owner = ['react-rn-permission', 'expo-rn-permission'].includes(scenario) ? 'rn' : scenario === 'expo-expo-permission' ? 'expo' : undefined;
      const location = ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'];
      const camera = ['android.permission.CAMERA'];
      const report = { passed: true, platform, profile: 'release', formatVersion: 2, abiVersion: 3,
        artifactSha256: retained.exports[platform].artifactSha256, cliPackageSha256: producer.packages[0]!.sha256,
        packageSource: 'transferred', packageSha256: producer.packages.find(item => item.sdk === sdk)!.sha256,
        sourceFree: true, deviceAbi: 'x86_64', pageSize: 16384, nonDebuggable: true, architectures: ['arm64'],
        expo: name.startsWith('expo-') ? {
          permissionOwner: owner ?? 'tauri',
          initial: { applicationCreates: 1, created: 1, destroyed: 0, activityCreates: 1, backs: 1, callbacks: 0 },
          final: { applicationCreates: 1, created: 3, destroyed: 2, activityCreates: 3, backs: 3, callbacks: owner === 'expo' ? 2 : 0 },
          closed: { applicationCreates: 1, created: 3, destroyed: 3, activityCreates: 3, backs: 3, callbacks: owner === 'expo' ? 2 : 0 },
        } : name === 'expo', cng: name.includes('-cng-') ? { nativeProbe: 'actual config plugin', compositionSha256: sha('CNG composition') } : name === 'expo' ? { nativeProbe: 'executed' } : false,
        rendererClosed: { destroyed: true, listeners: 0 },
        mode: name === 'standalone' ? 'standalone Tauri Mobile' : name.split('-')[0],
        producerDeleted: true, producerUnchanged: true, sourceHashes, transferredBinarySha256: retained.standalone[platform].binarySha256,
        recreations: 2, nativeUiFlows: count, pendingPermission: !!owner || name.endsWith('pending-permission'), freshPermission: name.endsWith('fresh-permission'),
        ...(owner ? {
          rendererPermissionOwner: owner, permissionResults: [],
          rendererRequests: [0, 1].flatMap(index => [{ activity: index + 1, permissions: location }, { activity: index + 2, permissions: camera }]),
          rendererListenerResults: [0, 1].map(index => ({ activity: index + 2, permissions: camera, grants: [index === 1 ? 0 : -1] })),
          rendererOsResults: [0, 1].flatMap(index => [
            { activity: index + 2, hasCurrentRequest: false, grants: Object.fromEntries(location.map(permission => [permission, index === 1])) },
            { activity: index + 2, hasCurrentRequest: true, grants: { 'android.permission.CAMERA': index === 1 } },
          ]),
        } : {}),
      };
      return { name, report, reportSha256: sha(report), flows: Array.from({ length: count }, (_, index) => ({ name: `flow-${index}`, sha256: sha(`${name}-${index}`) })) };
    }),
  };
}
function changeReport(receipt: RetainedNativeReceipt, name: string, change: (report: Record<string, unknown>) => void) {
  const gate = receipt.gates.find(gate => gate.name === name)!;
  change(gate.report); gate.reportSha256 = sha(gate.report);
  return receipt;
}

test('retained export certification rejects other inputs, changed source and failed recovery', () => {
  const validate = (input: unknown) => validateRetainedProducer(input, producer, sha(producer));
  validate(retained);
  assert.throws(() => validate({ ...retained, commit: 'b'.repeat(40) }), /another commit/);
  assert.throws(() => validate({ ...retained, producerReceiptSha256: sha('other producer') }), /another producer/);
  assert.throws(() => validate({ ...retained, exports: { android: retained.exports.android } }));
  for (const mutate of [
    (copy: RetainedProducerReceipt) => { copy.exports.android.cliPackageSha256 = sha('another CLI'); },
    (copy: RetainedProducerReceipt) => { copy.exports.android.formatVersion = 1; },
    (copy: RetainedProducerReceipt) => { copy.exports.android.targets = 'aarch64'; },
    (copy: RetainedProducerReceipt) => { copy.exports.ios.producerDeleted = false; },
    (copy: RetainedProducerReceipt) => { copy.exports.ios.sourceHashes = { 'src-tauri/src/lib.rs': sha('changed producer') }; },
    (copy: RetainedProducerReceipt) => { copy.exports.ios.incrementalAcceptance.previousArtifactPreserved = false; },
    (copy: RetainedProducerReceipt) => { copy.standalone.android.binarySha256 = sha('different ordinary APK'); },
    (copy: RetainedProducerReceipt) => { copy.desktop.retained.setupFailureObserved = false; },
  ]) { const copy = structuredClone(retained); mutate(copy); assert.throws(() => validate(copy)); }
});

test('successful native jobs cannot certify missing hosts, stale exports or unexecuted lifecycle modes', () => {
  for (const platform of ['ios', 'android'] as const) {
    const validate = (input: unknown) => validateRetainedNative(input, platform, retained, sha(retained));
    const complete = native(platform); validate(complete);
    assert.throws(() => validate({ ...complete, commit: 'b'.repeat(40) }), /another commit/);
    assert.throws(() => validate({ ...complete, retainedProducerSha256: sha('old export') }), /another export/);
    assert.throws(() => validate({ ...complete, gates: complete.gates.filter(gate => gate.name !== 'expo') }), /Missing retained native gate/);
    const incomplete = native(platform); incomplete.gates[0]!.flows = [];
    assert.throws(() => validate(incomplete), /UI results/);
    const truncated = native(platform); truncated.gates.find(gate => gate.name === 'react-native')!.flows.pop();
    assert.throws(() => validate(truncated), /missing UI scenarios/);
    assert.throws(() => validate(changeReport(native(platform), 'lynx', report => { report.packageSha256 = sha('repacked'); })), /another SDK/);
    assert.throws(() => validate(changeReport(native(platform), 'native', report => { report.artifactSha256 = sha('stale'); })), /another artifact/);
    assert.throws(() => validate(changeReport(native(platform), 'expo', report => { report.cng = false; })), /CNG must execute/);
    const edited = native(platform); edited.gates[0]!.report.passed = false;
    assert.throws(() => validate(edited), /Changed native report/);
  }
  assert.throws(() => validateRetainedNative(changeReport(native('android'), 'react-native', report => { report.deviceAbi = 'arm64-v8a'; }), 'android', retained, sha(retained)));
  assert.throws(() => validateRetainedNative(changeReport(native('android'), 'react-pending-permission', report => { report.pendingPermission = false; }), 'android', retained, sha(retained)));
});

test('Expo recreation certification rejects missing scenarios and incomplete native teardown', () => {
  const validate = (input: unknown) => validateRetainedNative(input, 'android', retained, sha(retained));
  const missing = native('android'); missing.gates = missing.gates.filter(gate => gate.name !== 'expo-pending-permission');
  assert.throws(() => validate(missing), /Missing retained native gate/);
  assert.throws(() => validate(changeReport(native('android'), 'expo-recreation', report => { report.expo = true; })), /native module lifecycle evidence/);
  for (const [key, value] of [['destroyed', 2], ['applicationCreates', 3], ['callbacks', 1]] as const) {
    assert.throws(() => validate(changeReport(native('android'), 'expo-fresh-permission', report => {
      (report.expo as { closed: Record<string, number> }).closed[key] = value;
    })));
  }
});

test('renderer permission certification rejects stale listeners, mixed results and missing owner gates', () => {
  const validate = (input: unknown) => validateRetainedNative(input, 'android', retained, sha(retained));
  for (const name of ['react-rn-permission', 'expo-rn-permission', 'expo-expo-permission', 'expo-cng-rn-permission', 'expo-cng-expo-permission']) {
    const missing = native('android'); missing.gates = missing.gates.filter(gate => gate.name !== name);
    assert.throws(() => validate(missing), /Missing retained native gate/);
    for (const mutate of [
      (report: any) => { report.rendererListenerResults[0].activity = 1; },
      (report: any) => { report.rendererListenerResults.push(report.rendererListenerResults[0]); },
      (report: any) => { report.rendererOsResults[0].hasCurrentRequest = true; },
      (report: any) => { report.rendererOsResults[0].grants = {}; },
      (report: any) => { report.rendererListenerResults[0].permissions = ['android.permission.ACCESS_FINE_LOCATION']; },
      (report: any) => { report.rendererListenerResults[1].grants = [-1]; },
      (report: any) => { report.permissionResults = report.rendererOsResults; },
      (report: any) => { report.rendererClosed.destroyed = false; },
    ]) assert.throws(() => validate(changeReport(native('android'), name, mutate)));
  }
});

test('native recreation certification distinguishes bare RN and actual Expo CNG with cleanup', () => {
  const validate = (input: unknown) => validateRetainedNative(input, 'android', retained, sha(retained));
  assert.throws(() => validate(changeReport(native('android'), 'react-rn-permission', report => { report.expo = true; })), /must not use Expo/);
  for (const name of ['expo-cng-recreation', 'expo-cng-fresh-permission', 'expo-cng-pending-permission', 'expo-cng-rn-permission', 'expo-cng-expo-permission']) {
    const missing = native('android'); missing.gates = missing.gates.filter(gate => gate.name !== name);
    assert.throws(() => validate(missing), /Missing retained native gate/);
    assert.throws(() => validate(changeReport(native('android'), name, report => { report.cng = false; })), /actual config plugins/);
    assert.throws(() => validate(changeReport(native('android'), name, report => { report.cng = { nativeProbe: 'actual config plugin' }; })));
    assert.throws(() => validate(changeReport(native('android'), name, report => { report.rendererClosed = { destroyed: true, listeners: 1 }; })), /native destruction/);
  }
  assert.throws(() => validate(changeReport(native('android'), 'expo-cng-expo-permission', report => {
    (report.expo as { closed: Record<string, number> }).closed.callbacks = 3;
  })));
});

test('the workflow makes both retained platforms and their producer mandatory for the candidate', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/validate.yml', import.meta.url), 'utf8');
  const candidate = workflow.slice(workflow.indexOf('\n  candidate:'));
  const dependencies = candidate.match(/\n    needs: \[([^\]]+)\]/)![1]!.split(',').map(value => value.trim());
  assert.deepEqual(dependencies.sort(), [...requiredChecks].sort());
  assert.match(candidate, /if: always\(\)/);
  const results = JSON.parse(candidate.match(/VALIDATION_RESULTS: '([^']+)'/)![1]!);
  assert.deepEqual(Object.keys(results).sort(), [...requiredChecks].sort());
  for (const name of requiredChecks) assert.equal(results[name], `\${{ needs.${name}.result }}`);
  for (const name of ['retained-producer', 'retained-ios', 'retained-android']) {
    const start = workflow.indexOf(`\n  ${name}:`); assert(start > 0);
    const rest = workflow.slice(start + 1), next = rest.search(/\n {2}\S/);
    const block = next < 0 ? rest : rest.slice(0, next);
    // Job-level conditions and continue-on-error must not turn a missing gate green.
    assert(!/^    if:/m.test(block)); assert(!/continue-on-error:\s*true/.test(block));
  }
  assert.match(workflow, /run: node scripts\/ci\/retained-producer\.ts/);
  assert.match(workflow, /run: node scripts\/ci\/retained-native\.ts ios/);
  assert.match(workflow, /script: ANDROID_SERIAL=emulator-5554 node --experimental-strip-types scripts\/ci\/retained-native\.ts android/);
});
