import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Platform, ProducerReceipt, RetainedNativeReceipt, RetainedProducerReceipt } from './validation-types.ts';

const hash = (value: string) => assert.match(value, /^[a-f0-9]{64}$/);
export const retainedGates = (platform: Platform) => ['standalone', 'native', 'react-native', 'expo', 'lynx',
  ...(platform === 'android' ? [...['react', 'expo', 'lynx'].flatMap(sdk => ['recreation', 'fresh-permission', 'pending-permission'].map(mode => `${sdk}-${mode}`)),
    'react-rn-permission', 'expo-rn-permission', 'expo-expo-permission',
    ...['recreation', 'fresh-permission', 'pending-permission', 'rn-permission', 'expo-permission'].map(mode => `expo-cng-${mode}`)] : [])];

export function validateRetainedProducer(input: unknown, producer: ProducerReceipt, producerSha256: string) {
  const receipt = input as RetainedProducerReceipt;
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.passed, true);
  assert.equal(receipt.commit, producer.commit, 'Retained export used another commit');
  assert.equal(receipt.producerReceiptSha256, producerSha256, 'Retained export used another producer');
  assert.deepEqual(receipt.packages, producer.packages, 'Retained export used other packages');
  hash(receipt.archiveSha256);
  assert.deepEqual(Object.keys(receipt.exports).sort(), ['android', 'ios']);
  assert.deepEqual(Object.keys(receipt.standalone).sort(), ['android', 'ios']);
  for (const desktop of Object.values(receipt.desktop)) {
    assert.equal(desktop.passed, true); assert.equal(desktop.producerUnchanged, true);
  }
  assert.equal(receipt.desktop.retained.setupFailureObserved, true);
  const cli = producer.packages.find(item => item.sdk === 'cli'); assert(cli);
  for (const platform of ['ios', 'android'] as const) {
    const exported = receipt.exports[platform], original = receipt.standalone[platform];
    assert.equal(exported.schemaVersion, 1); assert.equal(exported.passed, true);
    assert.equal(exported.platform, platform); assert.equal(exported.profile, 'release');
    assert.equal(exported.targets, platform === 'ios' ? 'aarch64-sim' : 'x86_64');
    assert.equal(exported.formatVersion, 2); assert.equal(exported.abiVersion, 3);
    assert.equal(exported.cliPackageSha256, cli.sha256, 'Export did not use the transferred CLI');
    assert.equal(exported.producerUnchanged, true); assert.equal(exported.producerDeleted, true);
    hash(exported.artifactSha256);
    assert(Object.keys(exported.sourceHashes).length > 0);
    for (const digest of Object.values(exported.sourceHashes)) hash(digest);
    assert.deepEqual(exported.sourceHashes, exported.originalFixtureHashes);
    assert.deepEqual(exported.sourceHashes, receipt.desktop.ordinary.sourceHashes);
    assert.deepEqual(exported.incrementalAcceptance, { unchangedHit: true, invalidCapabilityRejected: true, previousArtifactPreserved: true });
    assert.equal(original.schemaVersion, 1); assert.equal(original.passed, true); assert.equal(original.platform, platform);
    assert.equal(original.target, exported.targets);
    assert.equal(original.producerDeleted, true); assert.equal(original.producerUnchanged, true);
    assert.deepEqual(original.sourceHashes, exported.sourceHashes); hash(original.binarySha256);
    assert(original.files.length > 0);
    assert(original.files.some(file => file.path === original.executable && file.sha256 === original.binarySha256));
  }
  return receipt;
}

export function validateRetainedNative(input: unknown, platform: Platform, producer: RetainedProducerReceipt, producerSha256: string) {
  const receipt = input as RetainedNativeReceipt;
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.passed, true);
  assert.equal(receipt.platform, platform); assert.equal(receipt.commit, producer.commit, 'Retained native checks used another commit');
  assert.equal(receipt.producerReceiptSha256, producer.producerReceiptSha256, 'Retained native checks used another package producer');
  assert.equal(receipt.retainedProducerSha256, producerSha256, 'Retained native checks used another export');
  assert.deepEqual(receipt.packages, producer.packages);
  assert.deepEqual(receipt.gates.map(gate => gate.name).sort(), retainedGates(platform).sort(), 'Missing retained native gate');
  for (const gate of receipt.gates) {
    hash(gate.reportSha256);
    assert(gate.flows.length > 0, 'Native gate needs successful UI results');
    assert.equal(new Set(gate.flows.map(flow => flow.name)).size, gate.flows.length);
    for (const flow of gate.flows) hash(flow.sha256);
    const report = gate.report;
    assert.equal(createHash('sha256').update(JSON.stringify(report, null, 2) + '\n').digest('hex'), gate.reportSha256, 'Changed native report contents');
    assert.equal(report.passed, true, `${gate.name} failed`);
    const recreation = gate.name.includes('recreation') || gate.name.endsWith('-permission');
    if (!recreation) {
      const minimum = gate.name === 'standalone' ? 8 : gate.name === 'native' ? 12 : gate.name === 'lynx' ? 17 : gate.name === 'expo' ? (platform === 'ios' ? 34 : 32) : platform === 'ios' ? 25 : 24;
      assert(gate.flows.length >= minimum, `${gate.name} is missing UI scenarios`);
    }
    if (!recreation) assert.equal(report.platform, platform);
    if (gate.name === 'standalone') {
      assert.equal(report.mode, 'standalone Tauri Mobile');
      assert.equal(report.producerUnchanged, true); assert.equal(report.producerDeleted, true);
      assert.deepEqual(report.sourceHashes, producer.standalone[platform].sourceHashes);
      assert.equal(report.transferredBinarySha256, producer.standalone[platform].binarySha256);
      continue;
    }
    assert.equal(report.profile, 'release');
    assert.equal(report.artifactSha256, producer.exports[platform].artifactSha256, `${gate.name} used another artifact`);
    if (!recreation) { assert.equal(report.formatVersion, 2); assert.equal(report.abiVersion, 3); }
    const sdk = gate.name.startsWith('lynx') ? 'lynx' : gate.name === 'native' ? 'cli' : 'react-native';
    const packed = producer.packages.find(item => item.sdk === sdk); assert(packed);
    if (platform === 'android') { assert.equal(report.deviceAbi, 'x86_64'); assert.equal(report.pageSize, 16384); }
    if (sdk === 'cli') assert.equal(report.cliPackageSha256, packed.sha256);
    else {
      assert.equal(report.packageSource, 'transferred');
      assert.equal(report.packageSha256, packed.sha256, `${gate.name} used another SDK`);
      if (!recreation) assert.equal(report.sourceFree, true);
      if (platform === 'android') {
        if (!recreation) assert.equal(report.nonDebuggable, true);
      } else assert.deepEqual(report.architectures, ['arm64']);
    }
    if (gate.name === 'expo') {
      assert.equal(report.expo, true); assert(report.cng && typeof report.cng === 'object', 'Expo CNG must execute');
    }
    if (recreation) {
      const expo = gate.name.startsWith('expo-');
      const scenario = gate.name.replace('-cng-', '-'), cng = scenario !== gate.name;
      const owner = ['react-rn-permission', 'expo-rn-permission'].includes(scenario) ? 'rn' : scenario === 'expo-expo-permission' ? 'expo' : undefined;
      assert.equal(report.mode, gate.name.split('-')[0]);
      assert.equal(report.recreations, 2);
      assert.equal(gate.flows.length, report.nativeUiFlows);
      assert.equal(report.nativeUiFlows, owner ? expo ? 15 : 12 : (gate.name.endsWith('pending-permission') ? 9 : gate.name.endsWith('fresh-permission') ? 7 : 5) + (expo ? 4 : 0));
      assert.equal(report.pendingPermission, !!owner || gate.name.endsWith('pending-permission'));
      assert.equal(report.freshPermission, gate.name.endsWith('fresh-permission'));
      if (expo || owner) assert.deepEqual(report.rendererClosed, { destroyed: true, listeners: 0 }, 'Renderer must finish native destruction');
      if (cng) {
        const result = report.cng as { nativeProbe: string; compositionSha256: string };
        assert.equal(result?.nativeProbe, 'actual config plugin', 'CNG recreation must consume actual config plugins');
        hash(result.compositionSha256);
      } else assert.equal(report.cng, false);
      if (expo) {
        const modules = report.expo as { initial: Record<string, number>; final: Record<string, number>; closed: Record<string, number>; permissionOwner: string };
        assert(modules && typeof modules === 'object', 'Expo recreation needs native module lifecycle evidence');
        assert.equal(modules.permissionOwner, owner ?? 'tauri');
        for (const [phase, created, destroyed, activities, backs] of [['initial', 1, 0, 1, 1], ['final', 3, 2, 3, 3], ['closed', 3, 3, 3, 3]] as const) {
          const state = modules[phase];
          assert.equal(state.applicationCreates, 1);
          assert.equal(state.created, created); assert.equal(state.destroyed, destroyed);
          assert.equal(state.activityCreates, activities); assert.equal(state.backs, backs);
          assert.equal(state.callbacks, owner === 'expo' && phase !== 'initial' ? 2 : 0, 'Only current Expo requests may reach Expo callbacks');
        }
      }
      if (owner) {
        if (!expo) assert(!report.expo, 'Bare RN permission acceptance must not use Expo composition');
        assert.equal(report.rendererPermissionOwner, owner);
        assert.deepEqual(report.permissionResults, [], 'Renderer results must not reach the Tauri permission callback');
        const { rendererRequests: requests, rendererListenerResults: listeners, rendererOsResults: results } = report;
        assert(Array.isArray(requests) && Array.isArray(listeners) && Array.isArray(results), 'Renderer permission evidence is missing');
        assert.equal(requests.length, 4); assert.equal(listeners.length, 2); assert.equal(results.length, 4);
        const location = ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'];
        const camera = ['android.permission.CAMERA'];
        for (let index = 0; index < 2; index++) {
          const previous: Record<string, unknown> = requests[index * 2], current: Record<string, unknown> = requests[index * 2 + 1];
          assert.notEqual(previous.activity, current.activity, 'Permission owner must recreate');
          assert.deepEqual(previous.permissions, location); assert.deepEqual(current.permissions, camera);
          assert.equal(results[index * 2].activity, current.activity);
          assert.equal(results[index * 2].hasCurrentRequest, false, 'Old result must not settle a new request');
          assert.deepEqual(results[index * 2].grants, Object.fromEntries(location.map(permission => [permission, index === 1])));
          assert.equal(results[index * 2 + 1].activity, current.activity);
          assert.equal(results[index * 2 + 1].hasCurrentRequest, true);
          assert.deepEqual(results[index * 2 + 1].grants, { 'android.permission.CAMERA': index === 1 });
          assert.equal(listeners[index].activity, current.activity, 'Retired listener received a result');
          assert.deepEqual(listeners[index].permissions, camera);
          assert.deepEqual(listeners[index].grants, [index === 1 ? 0 : -1]);
        }
      }
    }
  }
  return receipt;
}
