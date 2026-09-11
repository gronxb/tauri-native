import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import type { CandidateReceipt, NativeReceipt, PackageManifest, ProducerReceipt } from './validation-types.ts';

export const requiredChecks = ['producer', 'native-ios', 'native-android', 'retained-producer', 'retained-ios', 'retained-android'];

export function validateNativeReceipt(input: unknown, platform: string, producerInput: unknown, producerSha256: string) {
  const report = input as NativeReceipt;
  const producer = producerInput as ProducerReceipt;
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.platform, platform);
  assert.equal(report.commit, producer.commit, 'Native checks used a different commit');
  assert.equal(report.producerReceiptSha256, producerSha256, 'Native checks used different inputs');
  assert.equal(report.passed, true, 'Native checks did not pass');
  assert.deepEqual(report.packages, producer.packages, 'Native checks used different packages');
  assert.deepEqual([...report.checks].sort(), ['feature', 'feature-changed', 'async-rn', 'async-lynx', 'view-rn', 'view-lynx', ...(platform === 'android' ? ['standalone-android'] : [])].sort(), 'Incomplete native gates');
  assert.deepEqual(report.features.map(item => item.changedRust).sort(), [false, true]);
  for (const feature of report.features) {
    assert.equal(feature.passed, true);
    assert.deepEqual(feature.results.map(item => item.host).sort(), ['expo', 'lynx', 'rn']);
    for (const item of feature.results) {
      assert.equal(item.passed, true); assert.equal(item.platform, platform);
      assert.equal(item.packageSha256, producer.packages.find(packed => packed.sdk === (item.host === 'lynx' ? 'lynx' : 'react-native'))!.sha256);
      if (feature.changedRust) {
        assert.equal(item.abandonment.length, 2);
        assert(item.abandonment.every(result => result.elapsedMs < 18000 && result.injectedSearchDelayMs === 20000));
      }
    }
  }
  if (platform === 'android') {
    assert.equal(report.lynxAndroidMinified, true);
    assert.match(report.lynxR8MappingSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.standalone.emulator.pageSize, 16384);
    assert.equal(report.standalone.transferredApkSha256, producer.androidPreparation.apkSha256);
  }
}

// Publication receives the exact tarballs that the successful native jobs used.
// Workflow dependencies authorize release; this receipt prevents a stale commit,
// changed package or incomplete download from being published accidentally.
export function readReleaseCandidate(directory: string, expectedCommit: string, expectedPackages: Pick<PackageManifest, 'name' | 'version' | 'publishConfig'>[]) {
  const candidate = JSON.parse(readFileSync(path.join(directory, 'candidate.json'), 'utf8')) as CandidateReceipt;
  assert.equal(candidate.schemaVersion, 1, 'Unsupported candidate receipt');
  assert.equal(candidate.commit, expectedCommit, 'Candidate must match the release commit');
  assert.equal(candidate.passed, true, 'Candidate validation did not pass');
  assert.deepEqual(Object.keys(candidate.checks).sort(), [...requiredChecks].sort(), 'Missing required validation jobs');
  for (const check of requiredChecks) assert.equal(candidate.checks[check], 'success', `${check} did not pass`);
  assert.deepEqual(candidate.packages.map(item => item.name).sort(), expectedPackages.map(item => item.name).sort(), 'Candidate package set does not match the checkout');
  return candidate.packages.map(item => {
    assert.equal(path.basename(item.file), item.file, 'Package receipt must name a local tarball');
    assert(item.file.endsWith('.tgz'), 'Expected an npm tarball');
    const tarball = path.join(directory, item.file);
    const bytes = readFileSync(tarball);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, `Changed candidate tarball: ${item.name}`);
    const result = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Cannot read candidate manifest: ${item.file}`);
    const packed = JSON.parse(result.stdout) as PackageManifest;
    const expected = expectedPackages.find(value => value.name === item.name);
    assert(expected);
    assert.equal(packed.name, expected.name, 'Packed name does not match the checkout');
    assert.equal(packed.version, expected.version, 'Packed version does not match the checkout');
    assert.deepEqual(packed.publishConfig, expected.publishConfig, 'Packed publish settings do not match the checkout');
    assert.equal(item.version, packed.version, 'Receipt version does not match its tarball');
    return { ...packed, tarball };
  });
}
