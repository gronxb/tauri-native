import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProject } from '../../src/discovery/project.ts';
import { prepareRuntime, type NativeCallerPolicy } from '../../src/runtime/workspace.ts';
import { generateCommands } from '../../src/types/commands.ts';
import { snapshot } from '../native-export/source-integrity.ts';
import { waitForDesktopReport } from '../native-export/desktop-report.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = path.join(root, 'packages/cli/test/fixtures/runtime-tauri');
const original = snapshot(fixture);
const work = path.join(root, 'target/retained-runtime');
const producer = path.join(work, 'ordinary producer');
const report = path.join(work, 'contract-report.json');
const baseline = path.join(homedir(), 'Library/Application Support/dev.taurinative.runtimeproof/runtime-report.json');
const target = path.join(root, 'target');
const policy: NativeCallerPolicy = { version: 1, callers: {
  reader: { webview: 'main', commands: ['snapshot', 'embedded_observation', 'pending_started'] },
  writer: { webview: 'main', commands: ['snapshot', 'increment', 'increment_async', 'plugin:runtime-probe|read', 'plugin:runtime-probe|forbidden', 'unregistered', 'observe_from_webview', 'held_increment', 'release_pending'] },
} };

function run(label: string, command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(path.join(work, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

assert.equal(process.platform, 'darwin', 'Real Wry retained-runtime acceptance requires macOS.');
mkdirSync(work, { recursive: true });
rmSync(producer, { recursive: true, force: true });
cpSync(fixture, producer, { recursive: true });
run('install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], producer);
// Extra ordinary Tauri commands provide deterministic pending-work barriers and
// observe the real embedded caller. They are authored before export begins.
const source = path.join(producer, 'src-tauri/src/lib.rs');
const extra = `
static PENDING_STARTED: AtomicU32 = AtomicU32::new(0);
static PENDING_RELEASED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static EMBEDDED: std::sync::atomic::AtomicI32 = std::sync::atomic::AtomicI32::new(0);
#[tauri::command]
fn pending_started() -> u32 { PENDING_STARTED.load(Ordering::SeqCst) }
#[tauri::command]
fn release_pending() { PENDING_RELEASED.store(true, Ordering::SeqCst); }
#[tauri::command]
async fn held_increment(app: AppHandle, delta: i32) -> Result<Snapshot, String> {
    PENDING_STARTED.fetch_add(1, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        while !PENDING_RELEASED.load(Ordering::SeqCst) { std::thread::sleep(std::time::Duration::from_millis(5)); }
        increment(app, delta)
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn observe_from_webview(app: AppHandle) {
    app.get_webview_window("main").unwrap().eval("window.__TAURI_INTERNALS__.invoke('snapshot').then(value => window.__TAURI_INTERNALS__.invoke('record_embedded', { value: value.value }))").unwrap();
}
#[tauri::command]
fn record_embedded(value: i32) { EMBEDDED.store(value, Ordering::SeqCst); }
#[tauri::command]
fn embedded_observation() -> i32 { EMBEDDED.load(Ordering::SeqCst) }
#[tauri::command]
fn unregistered() -> i32 { 999 }
`;
writeFileSync(source, readFileSync(source, 'utf8')
  .replace('            SETUP_COUNT.fetch_add', '            if std::env::var_os("RETAINED_SETUP_FAILURE").is_some() { return Err("setup proof rejected".into()); }\n            SETUP_COUNT.fetch_add')
  .replace('increment_async, record_report]', 'increment_async, record_report, pending_started, release_pending, held_increment, observe_from_webview, record_embedded, embedded_observation]') + extra);
const before = snapshot(producer);
const project = discoverProject('src-tauri', producer, false, 'retained');
assert.equal(project.abiVersion, 3);
assert.deepEqual(project.commands.find(command => command.name === 'snapshot')!.parameters, []);
assert.deepEqual(project.commands.find(command => command.name === 'increment_async')!.parameters.map(parameter => parameter.key), ['delta']);
assert.throws(() => discoverProject('src-tauri', producer), /not supported/);
const runtime = prepareRuntime(project, policy);
let app: ReturnType<typeof spawn> | undefined;
try {
  writeFileSync(path.join(work, 'commands.ts'), generateCommands(runtime.model));
  assert.deepEqual(snapshot(producer), before, 'Successful preparation preserves all producer files');
  // The native acceptance driver is linked only into this disposable test app.
  writeFileSync(runtime.project.source, readFileSync(runtime.project.source, 'utf8').replace('pub fn run() {', 'pub fn run() {\n    retained_contract::start();') +
    readFileSync(fileURLToPath(new URL('retained-contract.rs.fixture', import.meta.url)), 'utf8'));
  run('frontend', 'npm', ['run', 'build'], runtime.producer);
  run('build', 'cargo', ['build', '--offline', '--manifest-path', runtime.project.manifest, '--features', 'tauri/custom-protocol', '--target-dir', target], runtime.producer);
  rmSync(report, { force: true });
  rmSync(baseline, { force: true });
  const env = { ...process.env, RETAINED_CONTRACT_REPORT: report, RETAINED_BASELINE_REPORT: baseline };
  app = spawn(path.join(target, 'debug/ordinary-tauri-runtime-fixture'), [], { cwd: runtime.producer, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  app.stdout!.on('data', chunk => { log += chunk; });
  app.stderr!.on('data', chunk => { log += chunk; });
  const result = await waitForDesktopReport(report, app) as { passed: boolean; scenarios: string[] };
  writeFileSync(path.join(work, 'execution.log'), log);
  assert.equal(result.passed, true, log);
  assert.equal(result.scenarios.length, 12);
  const exited = new Promise(resolve => app!.once('exit', resolve));
  app.kill();
  await exited;
  // The same exported application keeps the original setup failure and never
  // advertises ready. This is an actual failed startup, not a fabricated State.
  const failure = spawnSync(path.join(target, 'debug/ordinary-tauri-runtime-fixture'), [], {
    cwd: runtime.producer, env: { ...env, RETAINED_SETUP_FAILURE: '1' }, encoding: 'utf8', timeout: 30000,
  });
  writeFileSync(path.join(work, 'setup-failure.log'), `${failure.stdout}\n${failure.stderr}`);
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /setup proof rejected/);
  assert.doesNotMatch(failure.stdout, /retained-native-ready/);
  assert.deepEqual(snapshot(producer), before, 'Successful and failed native startup preserve the producer');
  writeFileSync(path.join(work, 'report.json'), JSON.stringify({ passed: true, runtime: 'real Tauri 2.11.5 / Wry', result,
    fixtureHashes: original, scenarioProducerHashes: before, producerUnchanged: true, setupFailureObserved: true,
    nativePolicy: policy, command: 'nub --cwd packages/cli run test:runtime:retained', scope: 'macOS arm64; mobile execution remains required',
  }, null, 2) + '\n');
  console.log('PASS: real retained Tauri dispatch, caller policy/ACL, shared state, setup failure and late-result suppression.');
} finally {
  if (app && app.exitCode === null && app.signalCode === null) {
    const exited = new Promise(resolve => app!.once('exit', resolve));
    app.kill();
    await exited;
  }
  runtime.cleanup();
  assert.deepEqual(snapshot(fixture), original);
  assert.deepEqual(snapshot(producer), before);
}
