import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { inventory, sha256 } from '../../src/artifacts/files.ts';
import { validateArtifactManifest } from '../../src/artifacts/manifest.ts';
import { snapshot } from '../native-export/source-integrity.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const evidence = path.join(root, 'target/incremental-export'); mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-watch '));
const producer = path.join(work, 'ordinary producer'); const installation = path.join(work, 'installed cli');
const output = path.join(producer, 'copied exports/android');
const hookEvents = path.join(work, 'hook-events.jsonl'); const releases = path.join(work, 'releases'); mkdirSync(releases);
const env = { ...process.env, WATCH_BUILD_REPORT: hookEvents, WATCH_RELEASE_DIRECTORY: releases };
const cli = path.join(installation, 'node_modules/@tauri-native/cli/dist/index.mjs');
const timings = {}; let watcher; let watchLog = ''; let sequence = 0;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}\n${result.stdout}\n${result.stderr}`); return result.stdout;
}
const authored = () => Object.fromEntries(Object.entries(snapshot(producer)).filter(([name]) => !name.startsWith('copied exports/')));
const hooks = () => existsSync(hookEvents) ? readFileSync(hookEvents, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
const starts = () => hooks().filter(item => item.event === 'start').length;
function exportStep(name, extra = ['--incremental'], expected = 0, platform = 'android') {
  const before = authored(); const start = performance.now();
  const result = spawnSync(process.execPath, [cli, 'export', platform, '--output-dir', output, ...extra], { cwd: producer, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  timings[name] = Math.round(performance.now() - start);
  writeFileSync(path.join(evidence, `${++sequence}-${name}.log`), result.stdout + result.stderr);
  assert.equal(result.status, expected, result.stdout + result.stderr); assert.deepEqual(authored(), before);
  console.log(`${name}: ${timings[name]} ms`); return result.stdout + result.stderr;
}
function control(value) { writeFileSync(path.join(producer, 'build-control.json'), JSON.stringify({ label: 'normal', ...value })); }
function nativeHashes() { const receipt = validateArtifactManifest(output); return receipt.native.map(slice => receipt.files.find(file => file.path === slice.path).sha256); }
async function until(predicate, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) { assert(watcher?.exitCode == null, `Watch exited unexpectedly: ${watchLog}`); await delay(100); }
  assert(predicate(), `${label} timed out\n${watchLog}`);
}
function ready() { return watchLog.split('Artifact ready at').length - 1; }
async function stopWatch() {
  if (!watcher || watcher.exitCode !== null) return;
  for (const label of ['paused', 'latest']) writeFileSync(path.join(releases, label), 'release');
  watcher.kill('SIGINT');
  const exit = await Promise.race([new Promise(resolve => watcher.once('close', resolve)), delay(60000, undefined, { ref: false }).then(() => 'timeout')]);
  assert.equal(exit, 0, `Watch did not finish gracefully: ${watchLog}`);
}
assert.equal(process.platform, 'darwin', 'This gate requires the verified macOS export toolchain, iOS targets and Android NDK.');
try {
  cpSync(path.join(root, 'packages/cli/test/fixtures/standard-tauri'), producer, { recursive: true });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  const configFile = path.join(producer, 'src-tauri/tauri.conf.json'); const config = JSON.parse(readFileSync(configFile));
  config.build.beforeBuildCommand = 'node build-hook.mjs'; writeFileSync(configFile, JSON.stringify(config)); control({});
  writeFileSync(path.join(producer, 'build-hook.mjs'), `import {appendFileSync,existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';import path from 'node:path';import {setTimeout} from 'node:timers/promises';
const control=JSON.parse(readFileSync(new URL('./build-control.json',import.meta.url)));
const record=event=>appendFileSync(process.env.WATCH_BUILD_REPORT,JSON.stringify({event,label:control.label,cwd:process.cwd()})+'\\n');
record('start');while(control.hold&&!existsSync(path.join(process.env.WATCH_RELEASE_DIRECTORY,control.label)))await setTimeout(100);
const status=control.fail?23:spawnSync('npm',['run','build'],{stdio:'inherit'}).status;record('finish');process.exit(status??1);
`);
  mkdirSync(installation); writeFileSync(path.join(installation, 'package.json'), '{"private":true}');
  const packed = JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(work, packed[0].filename)], { cwd: installation });

  exportStep('ordinary-baseline', []); assert.equal(starts(), 1);
  exportStep('ordinary-repeat', []); assert.equal(starts(), 2);
  exportStep('incremental-prime'); assert.equal(starts(), 3);
  const unchanged = inventory(output);
  assert.match(exportStep('no-change'), /reused validated/); assert.equal(starts(), 3); assert.deepEqual(inventory(output), unchanged);
  exportStep('force', ['--incremental', '--force']); assert.equal(starts(), 4);
  const frontendFile = path.join(producer, 'src/main.js'); const frontend = readFileSync(frontendFile, 'utf8');
  const native = nativeHashes(); const oldAssets = inventory(path.join(output, 'assets'));
  writeFileSync(frontendFile, frontend + '\ndocument.documentElement.dataset.revision = "frontend-edit";\n');
  const frontendBuild = exportStep('frontend-edit'); assert.equal(starts(), 5);
  assert.doesNotMatch(frontendBuild, /Compiling ordinary-tauri-fixture/, 'Cargo must reuse unchanged native compilation');
  assert.deepEqual(nativeHashes(), native); assert.notDeepEqual(inventory(path.join(output, 'assets')), oldAssets);
  const rustFile = path.join(producer, 'src-tauri/src/lib.rs');
  writeFileSync(rustFile, readFileSync(rustFile, 'utf8').replace('Hello, {display_name}!', 'Hello again, {display_name}!'));
  exportStep('rust-edit'); assert.equal(starts(), 6); assert.notDeepEqual(nativeHashes(), native);
  const lock = path.join(producer, 'src-tauri/Cargo.lock'); writeFileSync(lock, readFileSync(lock, 'utf8') + '\n# Authored lockfile edit.\n');
  exportStep('lock-edit'); assert.equal(starts(), 7);
  const manifest = path.join(producer, 'src-tauri/Cargo.toml');
  writeFileSync(manifest, readFileSync(manifest, 'utf8') + '\n[features]\ncache_probe = []\ndefault = ["cache_probe"]\n');
  assert.match(exportStep('feature-edit'), /Compiling ordinary-tauri-fixture/); assert.equal(starts(), 8);
  writeFileSync(cli, readFileSync(cli, 'utf8') + '\n// Candidate implementation changed without a package version change.\n');
  exportStep('cli-edit'); assert.equal(starts(), 9);
  const header = path.join(installation, 'node_modules/@tauri-native/cli/native/src/tauri_native.h'); const headerBytes = readFileSync(header, 'utf8');
  const previousOutput = inventory(output);
  writeFileSync(header, headerBytes.replace('TAURI_NATIVE_ABI_VERSION 2', 'TAURI_NATIVE_ABI_VERSION 99'));
  assert.match(exportStep('protocol-mismatch', ['--incremental'], 1), /artifact_abi/);
  assert.equal(starts(), 10); assert.deepEqual(inventory(output), previousOutput);
  writeFileSync(header, headerBytes);
  assert.match(exportStep('protocol-restored'), /reused validated/); assert.equal(starts(), 10);
  exportStep('platform-ios', ['--incremental'], 0, 'ios'); assert.equal(validateArtifactManifest(output).platform, 'ios'); assert.equal(starts(), 11);
  exportStep('platform-android'); assert.equal(validateArtifactManifest(output).platform, 'android'); assert.equal(starts(), 12);

  control({ label: 'watch-start' });
  watcher = spawn(process.execPath, [cli, 'export', 'android', '--watch', '--output-dir', output], { cwd: producer, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [watcher.stdout, watcher.stderr]) stream.on('data', data => { watchLog += data; writeFileSync(path.join(evidence, 'watch.log'), watchLog); });
  await until(() => ready() === 1, 'initial watch export');
  const count = starts(); mkdirSync(path.join(producer, 'src-tauri/gen/other'), { recursive: true });
  writeFileSync(path.join(producer, 'src-tauri/gen/other/disposable'), 'generated'); await delay(2500);
  assert.equal(starts(), count, 'Generated directories must not trigger an export loop');
  writeFileSync(frontendFile, frontend + '\ndocument.documentElement.dataset.revision = "burst-one";\n'); await delay(50);
  writeFileSync(frontendFile, frontend + '\ndocument.documentElement.dataset.revision = "burst-two";\n');
  await until(() => ready() === 2, 'debounced frontend edits'); assert.equal(starts(), count + 1);
  const lastGood = inventory(output); control({ label: 'failed', fail: true });
  await until(() => watchLog.includes('Export failed;'), 'failed rebuild'); assert.deepEqual(inventory(output), lastGood);
  control({ label: 'recovered' }); await until(() => ready() === 3, 'recovery');
  const beforeConcurrentEdit = inventory(output); control({ label: 'paused', hold: true });
  await until(() => hooks().some(item => item.event === 'start' && item.label === 'paused'), 'paused build');
  writeFileSync(rustFile, readFileSync(rustFile, 'utf8').replace('Hello again, {display_name}!', 'Latest, {display_name}!'));
  control({ label: 'latest', hold: true }); writeFileSync(path.join(releases, 'paused'), 'release');
  await until(() => hooks().some(item => item.event === 'start' && item.label === 'latest'), 'queued latest build');
  assert.match(watchLog, /inputs_changed/); assert.deepEqual(inventory(output), beforeConcurrentEdit, 'The obsolete in-flight snapshot must not publish');
  writeFileSync(path.join(releases, 'latest'), 'release'); await until(() => ready() === 4, 'latest complete artifact');
  assert.equal(validateArtifactManifest(output).source.rustEntrySha256, sha256(readFileSync(rustFile)));
  await stopWatch(); assert.equal(existsSync(`${output}.lock`), false);
  let active = 0;
  for (const event of hooks()) { active += event.event === 'start' ? 1 : -1; assert(active === 0 || active === 1, 'Frontend builds must be serialized'); assert.notEqual(event.cwd, producer, 'Hooks must run in a disposable copy'); }
  assert.equal(active, 0);
  const artifacts = path.join(evidence, 'artifacts/android'); rmSync(artifacts, { recursive: true, force: true }); cpSync(output, artifacts, { recursive: true });
  writeFileSync(rustFile, readFileSync(rustFile, 'utf8').replace('format!("Latest, {display_name}!")', 'format!("{} {display_name}", env!("BUILD_GREETING"))'));
  const concurrentSource = authored();
  const variants = ['ArtifactAlphaVariant', 'ArtifactBetaVariant'];
  const concurrentResults = await Promise.allSettled(variants.map((variant, index) => new Promise((resolve, reject) => {
    const destination = path.join(work, `host-${index}`, 'artifacts');
    const child = spawn(process.execPath, [cli, 'export', 'android', '--incremental', '--output-dir', destination], { cwd: producer, env: { ...env, BUILD_GREETING: variant }, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { log += data; });
    child.once('error', reject);
    child.once('close', code => {
      writeFileSync(path.join(evidence, `concurrent-${index}.log`), log);
      try {
        assert.equal(code, 0, log);
        for (const slice of validateArtifactManifest(destination).native) {
          const bytes = readFileSync(path.join(destination, slice.path));
          assert(bytes.includes(Buffer.from(variant)), `Missing compiled environment value in ${slice.path}`);
          assert(!bytes.includes(Buffer.from(variants[1 - index])), `Another export overwrote ${slice.path}`);
        }
        resolve();
      } catch (error) { reject(error); }
    });
  })));
  for (const result of concurrentResults) if (result.status === 'rejected') throw result.reason;
  assert.deepEqual(authored(), concurrentSource);
  const report = { passed: true, installedCli: true, authoredSourcePreserved: true, timingsMs: timings, watch: { debounce: true, noGeneratedLoop: true, failureRecovery: true, concurrentEditPreservedOutput: true, gracefulStop: true },
    independentConcurrentOutputs: true, invalidation: ['frontend', 'Rust', 'Cargo.lock', 'default Cargo features', 'CLI implementation', 'ABI header', 'platform', 'compiled environment values'],
    tools: { rust: run('rustc', ['--version']).trim(), ndk: run('cargo', ['ndk', '--version']).trim(), node: process.version },
    nativeHostExecution: 'Separate test:export:ios and test:export:android gates execute refreshed Rust behavior in copied-artifact hosts.' };
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: incremental invalidation and watch recovery. Evidence: ${evidence}/report.json`);
} finally { await stopWatch(); rmSync(work, { recursive: true, force: true }); }
