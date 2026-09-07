import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
export const output = path.join(root, 'target/ci');
export const json = file => JSON.parse(readFileSync(file, 'utf8'));
export const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
export function record(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export function run(label, command, args, cwd = root, env = process.env) {
  mkdirSync(path.join(output, 'logs'), { recursive: true });
  const log = path.join(output, 'logs', `${label}.log`);
  console.log(`> ${label}: ${command} ${args.join(' ')}`);
  // Both hosted platforms provide Bash/tee. Positional arguments preserve paths
  // and payloads verbatim; pipefail keeps command errors from becoming success.
  const result = spawnSync('/bin/bash', ['-o', 'pipefail', '-c', '"$@" 2>&1 | tee "$TAURI_NATIVE_COMMAND_LOG"', 'tauri-native-ci', command, ...args], {
    cwd, env: { ...env, TAURI_NATIVE_COMMAND_LOG: log }, stdio: ['ignore', 'inherit', 'inherit'],
  });
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${readFileSync(log, 'utf8').slice(-12000)}`);
  return readFileSync(log, 'utf8');
}
export const commit = () => run('commit', 'git', ['rev-parse', 'HEAD']).trim();

export function readInput(directory) {
  const receipt = json(path.join(directory, 'producer.json'));
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.commit, commit(), 'Transferred exports must match this checkout');
  assert.equal(receipt.passed, true);
  assert.equal(digest(path.join(directory, 'exports.tar.gz')), receipt.exportsSha256);
  assert.deepEqual(receipt.packages.map(item => item.sdk).sort(), ['cli', 'lynx', 'react-native']);
  for (const item of receipt.packages) {
    assert.equal(path.basename(item.file), item.file);
    assert.equal(digest(path.join(directory, item.sdk, item.file)), item.sha256);
  }
  return receipt;
}
