import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProject } from '../../src/discovery/project.ts';
import { prepareAdapter } from '../../src/adapter/workspace.ts';
import { inventory } from '../../src/artifacts/files.ts';
import { validateIosArtifacts } from '../../src/artifacts/ios.ts';
import { androidTools, validateAndroidArtifacts } from '../../src/artifacts/android.ts';
import { snapshot } from './source-integrity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const evidence = path.join(root, 'target/async-protocol');
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-async-export-'));
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
assert.equal(process.platform, 'darwin', 'This gate requires macOS, Xcode, Rust mobile targets and the Android NDK.');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'export-report.json'), { force: true });
let adapter;
try {
  const producer = path.join(work, 'ordinary producer');
  cpSync(path.join(here, '../fixtures/standard-tauri'), producer, { recursive: true });
  cpSync(path.join(here, '../fixtures/async-tauri'), producer, { recursive: true });
  const manifest = path.join(producer, 'src-tauri/Cargo.toml');
  // Assemble the ordinary fixture before taking the authored-source baseline.
  writeFileSync(manifest, readFileSync(manifest, 'utf8') + '\ntokio = { version = "=1.53.1", features = ["time"] }\n');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  run('npm', ['run', 'build'], { cwd: producer });
  run('cargo', ['check', '--offline', '--lib', '--manifest-path', manifest, '--target-dir', path.join(root, 'target')]);
  const before = snapshot(producer);
  run('git', ['init', '--quiet'], { cwd: producer });
  run('git', ['add', '--', ...Object.keys(before)], { cwd: producer });
  const frontend = inventory(path.join(producer, 'dist'));
  // Compare real Tauri async IPC with the generated session ABI through both package bridges.
  const requests = [
    { command: 'delayed', payload: { label: 'awaited 한글 🦀', milliseconds: 1 } },
    { command: 'blocking', payload: { label: 'blocking', milliseconds: 1 } },
    { command: 'domain_failure', payload: {} },
    { command: 'nothing', payload: {} },
    { command: 'delayed', payload: { label: 'invalid', milliseconds: 'wrong' } },
  ];
  const requestFile = path.join(work, 'requests.json'); writeFileSync(requestFile, JSON.stringify(requests));
  const desktop = path.join(work, 'desktop-parity');
  cpSync(producer, desktop, { recursive: true, filter: file => !['node_modules', 'gen', '.git'].includes(path.basename(file)) });
  const desktopSource = path.join(desktop, 'src-tauri/src/lib.rs');
  const parity = readFileSync(path.join(here, 'desktop-parity.rs'), 'utf8').replace(/super::describe,[\s\S]*?super::nothing/, 'super::delayed, super::blocking, super::domain_failure, super::nothing');
  writeFileSync(desktopSource, readFileSync(desktopSource, 'utf8') + '\n' + parity);
  const desktopManifest = path.join(desktop, 'src-tauri/Cargo.toml');
  writeFileSync(desktopManifest, readFileSync(desktopManifest, 'utf8').replace('tauri = { version = "=2.11.5", features = [] }', 'tauri = { version = "=2.11.5", features = ["test"] }'));
  const desktopResult = path.join(work, 'desktop.json');
  run('cargo', ['test', '--locked', '--offline', '--lib', '--manifest-path', desktopManifest, '--target-dir', path.join(root, 'target'), 'export_parity::original_tauri_handler'], {
    env: { ...process.env, SPIKE_REQUESTS: requestFile, SPIKE_DESKTOP_RESULT: desktopResult },
  });
  adapter = prepareAdapter(discoverProject('src-tauri', producer));
  run('cargo', ['build', '--locked', '--offline', '--lib', '--manifest-path', adapter.manifest, '--target-dir', path.join(root, 'target')]);
  const bridges = [path.join(root, 'packages/react-native/ios/TNTauriRustBridge.mm'), path.join(root, 'packages/lynx/ios/src/TNTauriLynxRustBridge.mm')];
  const executable = path.join(work, 'AsyncBridgeHost');
  run('xcrun', ['clang++', '-std=c++17', '-fobjc-arc', '-framework', 'Foundation', '-I', path.dirname(adapter.header), ...bridges.flatMap(file => ['-I', path.dirname(file)]), ...bridges, path.join(here, 'AsyncBridgeHost.mm'), path.join(root, 'target/debug/libordinary_tauri_fixture_lib.dylib'), '-o', executable]);
  const nativeResult = path.join(work, 'native.json');
  run(executable, [requestFile, nativeResult]);
  for (const responses of Object.values(JSON.parse(readFileSync(nativeResult)))) {
    assert.deepEqual(responses, JSON.parse(readFileSync(desktopResult)));
  }
  const cli = path.join(work, 'cli'); mkdirSync(cli);
  const packed = JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]));
  writeFileSync(path.join(cli, 'package.json'), '{"private":true}');
  run('npm', ['install', '--prefix', cli, '--ignore-scripts', '--no-audit', '--no-fund', path.join(work, packed[0].filename)]);
  for (const platform of ['ios', 'android']) {
    run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', platform], { cwd: producer });
    const output = path.join(producer, 'src-tauri/gen/tauri-native', platform);
    if (platform === 'ios') validateIosArtifacts(output);
    else validateAndroidArtifacts(output, androidTools());
    const assets = inventory(path.join(output, platform === 'ios' ? 'TauriNativeAssets.bundle' : 'assets/tauri-native')).filter(file => file.path !== 'Info.plist');
    assert.deepEqual(assets, frontend);
    const copied = path.join(evidence, 'artifacts', platform);
    rmSync(copied, { recursive: true, force: true });
    cpSync(output, copied, { recursive: true });
    assert.deepEqual(snapshot(producer), before);
  }

  assert.deepEqual(snapshot(producer), before);
  run('git', ['diff', '--exit-code'], { cwd: producer });
  adapter.cleanup(); adapter = undefined;
  rmSync(producer, { recursive: true, force: true });
  rmSync(cli, { recursive: true, force: true });
  writeFileSync(path.join(evidence, 'export-report.json'), JSON.stringify({
    abiVersion: 2, installedCli: true, producerDeleted: true, producerUnchanged: true,
    frontendBytesUnchanged: true, desktopAsyncParity: true,
    macOSBridges: ['react-native', 'lynx'], outOfOrderRustExecution: true,
    parity: JSON.parse(readFileSync(nativeResult)), sourceHashes: before,
    mobileExecution: 'Separate RN/Lynx iOS/Android lifecycle gates required',
  }, null, 2) + '\n');
  console.log(`PASS: portable async artifacts and real Tauri async IPC parity. Evidence: ${evidence}/export-report.json`);
} finally {
  adapter?.cleanup();
  rmSync(work, { recursive: true, force: true });
}
