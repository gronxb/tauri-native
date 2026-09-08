import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../native-export/source-integrity.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
assert.equal(process.platform, 'darwin', 'This acceptance gate requires the supported macOS producer toolchain');
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-onboarding-'));
const producer = path.join(work, 'ordinary producer');
const evidence = path.join(root, 'target/onboarding');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
function run(command: string, args: string[], cwd = producer) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env: { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(root, 'target') }, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
try {
  const source = path.join(root, 'examples/ordinary-tauri-feature');
  for (const file of Object.keys(snapshot(source))) {
    mkdirSync(path.dirname(path.join(producer, file)), { recursive: true });
    cpSync(path.join(source, file), path.join(producer, file));
  }
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const original = snapshot(producer);
  const tarball = process.env.TAURI_NATIVE_CLI_TARBALL ?? path.join(work,
    JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]))[0].filename);
  run('npm', ['install', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  const installed = snapshot(producer);
  assert.deepEqual(Object.keys(installed).sort(), Object.keys(original).sort());
  const installationDiff = Object.keys(installed).filter(file => installed[file] !== original[file]);
  assert.deepEqual(installationDiff.sort(), ['package-lock.json', 'package.json']);
  const cli = path.join(producer, 'node_modules/.bin/tauri-native');
  run(cli, ['inspect']);
  for (const platform of ['ios', 'android']) {
    run(cli, ['export', platform]);
    assert(existsSync(path.join(producer, 'src-tauri/gen/tauri-native', platform, 'manifest.json')));
    assert.deepEqual(snapshot(producer), installed, 'Export changed the installed producer');
  }
  run('npm', ['uninstall', '--save-dev', '--ignore-scripts', '--no-audit', '--no-fund', '@tauri-native/cli']);
  rmSync(path.join(producer, 'src-tauri/gen'), { recursive: true });
  assert.equal(existsSync(cli), false, 'The producer must no longer contain the tauri-native CLI');
  const manifest = JSON.parse(readFileSync(path.join(producer, 'package.json'), 'utf8'));
  assert.equal(manifest.devDependencies['@tauri-native/cli'], undefined);
  const removed = snapshot(producer);
  assert.deepEqual(Object.keys(removed).sort(), Object.keys(original).sort());
  for (const file of Object.keys(original)) {
    if (!['package.json', 'package-lock.json'].includes(file)) assert.equal(removed[file], original[file], file);
  }
  run('npm', ['run', 'build:desktop']);
  assert.deepEqual(snapshot(producer), removed, 'Normal desktop build changed authored source');
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({
    passed: true, installationDiff, sourceUnchangedDuringExport: true, exportedPlatforms: ['ios', 'android'],
    cliRemoved: true, generatedOutputRemoved: true, ordinaryDesktopReleaseBuild: true,
    remainingJsDiff: ['package.json', 'package-lock.json'].filter(file => removed[file] !== original[file]),
    independentEvaluator: false,
  }, null, 2) + '\n');
  console.log(`PASS: install/export/uninstall preserves the ordinary desktop build. ${evidence}/report.json`);
} finally { rmSync(work, { recursive: true, force: true }); }
