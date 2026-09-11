import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareRetainedPackage } from '../retained-test-inputs.ts';

function transfer() {
  const root = mkdtempSync(path.join(tmpdir(), 'retained transferred SDK '));
  const producer = path.join(root, 'producer'), consumer = path.join(root, 'consumer');
  mkdirSync(path.join(producer, 'package'), { recursive: true }); mkdirSync(consumer);
  writeFileSync(path.join(producer, 'package/package.json'), JSON.stringify({ name: '@tauri-native/react-native', version: '1.0.0-rc.0' }));
  writeFileSync(path.join(producer, 'package/compose.js'), 'module.exports = "transferred composer";\n');
  const tarball = path.join(root, 'received candidate.tgz');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', producer, 'package']).status, 0);
  const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  rmSync(producer, { recursive: true });
  const commands: string[] = [];
  const run = (_label: string, command: string, args: string[], cwd?: string) => {
    commands.push([command, ...args].join(' '));
    assert.equal(command, 'tar', 'A transferred consumer must not run npm or package source scripts');
    const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  return { root, producer, consumer, tarball, sha256, commands, run,
    env: { GITHUB_ACTIONS: 'true', TAURI_NATIVE_SDK_TARBALL: tarball, TAURI_NATIVE_SDK_SHA256: sha256 } };
}

test('native acceptance unpacks the transferred SDK after deleting its producer, without npm', () => {
  const fixture = transfer();
  try {
    const result = prepareRetainedPackage(fixture.producer, 'react-native', fixture.consumer, fixture.run, fixture.env);
    assert.equal(result.source, 'transferred'); assert.equal(result.sha256, fixture.sha256);
    assert.deepEqual(readFileSync(result.tarball), readFileSync(fixture.tarball));
    assert.equal(readFileSync(path.join(result.directory, 'compose.js'), 'utf8'), 'module.exports = "transferred composer";\n');
    assert(!existsSync(fixture.producer));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('changed or unverifiable transferred bytes fail before any package command runs', () => {
  const fixture = transfer();
  try {
    assert.throws(() => prepareRetainedPackage(fixture.producer, 'react-native', fixture.consumer, fixture.run,
      { ...fixture.env, TAURI_NATIVE_SDK_SHA256: undefined }), /producer SHA-256/);
    writeFileSync(fixture.tarball, Buffer.concat([readFileSync(fixture.tarball), Buffer.from('changed during transfer')]));
    assert.throws(() => prepareRetainedPackage(fixture.producer, 'react-native', fixture.consumer, fixture.run, fixture.env), /differ from the producer/);
    assert.deepEqual(fixture.commands, []);
    assert(!existsSync(path.join(fixture.consumer, 'package')));
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test('CI rejects a missing transfer or the other renderer package without repacking', () => {
  const fixture = transfer();
  try {
    assert.throws(() => prepareRetainedPackage(fixture.producer, 'react-native', fixture.consumer, fixture.run,
      { GITHUB_ACTIONS: 'true' }), /CI must use the transferred SDK/);
    assert.throws(() => prepareRetainedPackage(fixture.producer, 'react-native', fixture.consumer, fixture.run,
      { TAURI_NATIVE_SDK_SHA256: fixture.sha256 }), /requires a transferred tarball/);
    assert.deepEqual(fixture.commands, []);
    assert.throws(() => prepareRetainedPackage(fixture.producer, 'lynx', fixture.consumer, fixture.run, fixture.env), /not the requested SDK/);
    assert(!existsSync(path.join(fixture.consumer, 'package')), 'Reject the wrong SDK before extraction');
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});
