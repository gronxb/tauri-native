import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from '../../src/artifacts/files.ts';
import { validateIosArtifacts } from '../../src/artifacts/ios.ts';
import { androidTools, validateAndroidArtifacts } from '../../src/artifacts/android.ts';
import { snapshot } from '../native-export/source-integrity.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const evidence = path.join(root, 'target/view-events');
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-events-'));
const producer = path.join(work, 'ordinary producer');
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
assert.equal(process.platform, 'darwin', 'Requires macOS, Xcode, Rust mobile targets and Android NDK.');
mkdirSync(evidence, { recursive: true });
const reportFile = path.join(evidence, 'desktop.json');
rmSync(reportFile, { force: true });
rmSync(path.join(evidence, 'export-report.json'), { force: true });
let desktop;
try {
  for (const fixture of ['standard-tauri', 'events-tauri']) {
    cpSync(path.join(root, 'packages/cli/test/fixtures', fixture), producer, { recursive: true });
  }
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  run('npm', ['run', 'build'], { cwd: producer });
  const manifest = path.join(producer, 'src-tauri/Cargo.toml');
  run('cargo', ['build', '--offline', '--manifest-path', manifest, '--features', 'tauri/custom-protocol', '--target-dir', path.join(root, 'target')]);
  const before = snapshot(producer);
  run('git', ['init', '--quiet'], { cwd: producer });
  run('git', ['add', '--', ...Object.keys(before)], { cwd: producer });
  const frontend = inventory(path.join(producer, 'dist'));
  desktop = spawn(path.join(root, 'target/debug/ordinary-tauri-fixture'), [], {
    cwd: producer, env: { ...process.env, TAURI_EVENT_REPORT: reportFile }, stdio: 'inherit',
  });
  const deadline = Date.now() + 60000;
  while (!existsSync(reportFile) && desktop.exitCode === null && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert(existsSync(reportFile), `Desktop frontend did not report; exit=${desktop.exitCode}`);
  const parity = JSON.parse(readFileSync(reportFile));
  assert.equal(parity.passed, true, JSON.stringify(parity));
  assert.equal(parity.documentId, 'desktop');
  desktop.kill(); desktop = undefined;

  const cli = path.join(work, 'cli'); mkdirSync(cli);
  const packed = JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]));
  writeFileSync(path.join(cli, 'package.json'), '{"private":true}');
  run('npm', ['install', '--prefix', cli, '--ignore-scripts', '--no-audit', '--no-fund', path.join(work, packed[0].filename)]);
  for (const platform of ['ios', 'android']) {
    run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', platform], { cwd: producer });
    const output = path.join(producer, 'src-tauri/gen/tauri-native', platform);
    if (platform === 'ios') validateIosArtifacts(output);
    else validateAndroidArtifacts(output, androidTools());
    assert.deepEqual(inventory(path.join(output, platform === 'ios' ? 'TauriNativeAssets.bundle' : 'assets/tauri-native')).filter(file => file.path !== 'Info.plist'), frontend);
    const destination = path.join(evidence, 'artifacts', platform);
    rmSync(destination, { recursive: true, force: true });
    cpSync(output, destination, { recursive: true });
    assert.deepEqual(snapshot(producer), before);
    run('git', ['diff', '--exit-code'], { cwd: producer });
  }
  rmSync(producer, { recursive: true, force: true });
  writeFileSync(path.join(evidence, 'export-report.json'), JSON.stringify({
    installedCli: true, producerDeleted: true, producerUnchanged: true,
    frontendBytesUnchanged: true, desktopFrontend: parity, sourceHashes: before,
    mobileExecution: 'Separate RN/Lynx iOS/Android view gates required',
  }, null, 2) + '\n');
  console.log(`PASS: real desktop event frontend and portable exports. Evidence: ${evidence}/export-report.json`);
} finally {
  desktop?.kill();
  rmSync(work, { recursive: true, force: true });
}
