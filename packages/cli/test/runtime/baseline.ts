import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../native-export/source-integrity.ts';
import { waitForDesktopReport } from '../native-export/desktop-report.ts';
import { prepareDependencySelection } from './dependency-selection.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const plugins = process.argv[2] === 'plugins';
assert(process.argv[2] === undefined || plugins, 'Select plugins or omit the fixture argument');
const dependencySelection = process.argv[3] === '--dependency-selection';
assert(process.argv[3] === undefined || (plugins && dependencySelection), 'Use plugins --dependency-selection for the platform dependency fixture');
const fixture = path.join(root, 'packages/cli/test/fixtures', plugins ? 'mobile-plugin-tauri' : 'runtime-tauri');
const evidence = path.join(root, dependencySelection ? 'target/retained-dependency-selection-desktop' : plugins ? 'target/tauri-mobile-plugins/standalone-desktop' : 'target/tauri-mobile-runtime');
const producer = path.join(evidence, 'desktop producer');
const cargoTarget = path.join(root, 'target');
const appIdentifier = plugins ? 'dev.taurinative.mobilefieldnotes' : 'dev.taurinative.runtimeproof';
const reportFile = path.join(homedir(), 'Library/Application Support', appIdentifier, 'runtime-report.json');
const original = snapshot(fixture);

function run(label: string, command: string, args: string[]) {
  console.log(`> ${label}`);
  const result = spawnSync(command, args, { cwd: producer, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

assert.equal(process.platform, 'darwin', 'The real-Wry desktop baseline requires macOS, Rust and Xcode. Mobile composition has separate acceptance.');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'desktop-report.json'), { force: true });
rmSync(producer, { recursive: true, force: true });
cpSync(fixture, producer, { recursive: true });
let desktop: ReturnType<typeof spawn> | undefined;
try {
  run('install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (dependencySelection) prepareDependencySelection(producer, run);
  const before = snapshot(producer);
  run('frontend', 'npm', ['run', 'build']);
  run('desktop-build', 'cargo', ['build', '--locked', '--offline', '--manifest-path', 'src-tauri/Cargo.toml', '--features',
    ['tauri/custom-protocol', ...(dependencySelection ? ['native-location'] : [])].join(','), '--target-dir', cargoTarget]);
  assert.deepEqual(snapshot(producer), before, 'Ordinary Tauri builds preserve authored producer files');
  rmSync(reportFile, { force: true });
  desktop = spawn(path.join(cargoTarget, plugins ? 'debug/ordinary-tauri-mobile-fieldnotes' : 'debug/ordinary-tauri-runtime-fixture'), [], { cwd: producer, stdio: 'inherit' });
  const result = await waitForDesktopReport(reportFile, desktop) as { passed: boolean; reloaded: boolean; state: unknown; scenarios: string[]; directory: string };
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.reloaded, true);
  assert.deepEqual(result.state, { value: 45, setupCount: 1, pluginSetupCount: 1, appIdentifier });
  assert.deepEqual(result.scenarios, ['setup', 'state', 'app-handle', 'async', 'rust-event', 'plugin-setup', 'plugin-allowed', 'plugin-denied', 'domain-error', 'reload']);
  assert.equal(path.resolve(result.directory), path.dirname(reportFile), 'JS path API and AppHandle agree on persistent app storage');
  assert.deepEqual(snapshot(producer), before);
  writeFileSync(path.join(evidence, 'desktop-report.json'), JSON.stringify({ passed: true, runtime: 'real Tauri 2.11.5 / Wry',
    target: `${process.platform}-${process.arch}`, rust: run('rust-version', 'rustc', ['--version']).trim(),
    sourceHashes: before, producerUnchanged: true, ...(dependencySelection ? { dependencySelection: true, originalFixtureHashes: original } : {}), result,
    mobileComposition: plugins ? 'Desktop independence only; native geolocation/permission callbacks require iOS/Android execution in #43' : 'Not established by the desktop baseline; tracked in #41',
  }, null, 2) + '\n');
  console.log(`PASS: actual Tauri setup, state, plugin ACL, async, events and reload. Evidence: ${evidence}/desktop-report.json`);
} finally {
  if (desktop && desktop.exitCode === null && desktop.signalCode === null) {
    const exited = new Promise(resolve => desktop!.once('exit', resolve));
    desktop.kill();
    await exited;
  }
  assert.deepEqual(snapshot(fixture), original, 'The checked-in producer remains unchanged even on failure');
}
