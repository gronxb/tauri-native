import assert from 'node:assert/strict';
import path from 'node:path';
import { validateRetainedProducer } from '../retained-validation.ts';
import { snapshot } from '../../packages/cli/test/native-export/source-integrity.ts';
import { digest, json, output, readInput, root } from './common.ts';

export const retainedInput = path.join(output, 'retained-input');
export const retainedPayload = path.join(output, 'retained-payload');
export function readRetainedInput() {
  const input = path.join(output, 'input');
  const producer = readInput(input);
  const receipt = validateRetainedProducer(json(path.join(retainedInput, 'retained-producer.json')), producer, digest(path.join(input, 'producer.json')));
  assert.deepEqual(receipt.exports.ios.originalFixtureHashes, snapshot(path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri')), 'Retained source does not match the checked-out ordinary Tauri app');
  assert.equal(digest(path.join(retainedInput, 'retained.tar.gz')), receipt.archiveSha256, 'Changed retained transfer');
  return receipt;
}
