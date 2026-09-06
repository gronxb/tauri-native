import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readReleaseCandidate, requiredChecks, validateNativeReceipt } from '../release-candidate.mjs';
import { digest, json, output, readInput, record, root } from './common.mjs';

const input = path.join(output, 'input');
const producer = readInput(input);
const checks = JSON.parse(process.env.VALIDATION_RESULTS);
assert.deepEqual(Object.keys(checks).sort(), [...requiredChecks].sort());
for (const check of requiredChecks) assert.equal(checks[check], 'success', `${check} failed, was cancelled, or did not run`);
const producerSha256 = digest(path.join(input, 'producer.json'));
for (const platform of ['ios', 'android']) {
  validateNativeReceipt(json(path.join(output, `native-${platform}.json`)), platform, producer, producerSha256);
}
const destination = path.join(output, 'release-candidate');
rmSync(destination, { recursive: true, force: true }); mkdirSync(destination);
for (const item of producer.packages) cpSync(path.join(input, item.sdk, item.file), path.join(destination, item.file));
record(path.join(destination, 'candidate.json'), { schemaVersion: 1, commit: producer.commit, passed: true, checks, packages: producer.packages });
readReleaseCandidate(destination, producer.commit, producer.packages.map(item => json(path.join(root, 'packages', item.sdk, 'package.json'))));
console.log(`PASS: all required jobs validated the same candidate. ${destination}`);
