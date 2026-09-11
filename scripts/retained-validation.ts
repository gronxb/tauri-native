import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Platform, ProducerReceipt, RetainedNativeReceipt, RetainedProducerReceipt } from './validation-types.ts';

const hash = (value: string) => assert.match(value, /^[a-f0-9]{64}$/);
export const retainedGates = (platform: Platform) => ['standalone', 'native', 'react-native', 'expo', 'lynx',
  ...(platform === 'android' ? ['react', 'lynx'].flatMap(sdk => ['recreation', 'fresh-permission', 'pending-permission'].map(mode => `${sdk}-${mode}`)) : [])];

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
      assert.equal(report.mode, gate.name.startsWith('react-') ? 'react' : 'lynx');
      assert.equal(report.recreations, 2);
      assert.equal(gate.flows.length, report.nativeUiFlows);
      assert.equal(report.nativeUiFlows, gate.name.endsWith('pending-permission') ? 9 : gate.name.endsWith('fresh-permission') ? 7 : 5);
      assert.equal(report.pendingPermission, gate.name.endsWith('pending-permission'));
      assert.equal(report.freshPermission, gate.name.endsWith('fresh-permission'));
    }
  }
  return receipt;
}
