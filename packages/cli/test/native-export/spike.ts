import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from './source-integrity.ts';
import { discoverProject } from '../../src/discovery/project.ts';
import { prepareAdapter } from '../../src/adapter/workspace.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const fixture = path.resolve(here, '../fixtures/standard-tauri');
const target = path.join(root, 'target');
const evidenceDirectory = path.join(target, 'export-spike');

function run(command: string, args: string[], options: Omit<import('node:child_process').SpawnSyncOptions, 'encoding'> = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

assert.equal(process.platform, 'darwin', 'The M0 proof requires macOS, Xcode, Rust and the installed example JS dependencies.');
mkdirSync(evidenceDirectory, { recursive: true });
const reportPath = path.join(evidenceDirectory, 'report.json');
rmSync(reportPath, { force: true });
const work = mkdtempSync(path.join(tmpdir(), 'tauri native export spike '));
const originalSnapshot = snapshot(fixture);
let adapter;
try {
  const producer = path.join(work, 'producer');
  cpSync(fixture, producer, { recursive: true });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  const producerSnapshot = snapshot(producer);
  run('git', ['init', '--quiet'], { cwd: producer });
  run('git', ['add', '--', ...Object.keys(producerSnapshot)], { cwd: producer });
  const exampleModules = path.join(producer, 'node_modules');
  const expected = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  for (const name of ['@tauri-apps/api', 'vite']) {
    const installed = JSON.parse(readFileSync(path.join(exampleModules, name, 'package.json'), 'utf8'));
    assert.equal(installed.version, expected.dependencies[name] ?? expected.devDependencies[name], `Install the fixture's pinned ${name} version before running this proof.`);
  }
  run(process.execPath, [path.join(exampleModules, 'vite/bin/vite.js'), 'build'], { cwd: producer });

  const source = path.join(producer, 'src-tauri/src/lib.rs');
  const sourceText = readFileSync(source, 'utf8');
  const project = discoverProject('src-tauri', producer);
  adapter = prepareAdapter(project);
  const generatedSource = path.join(path.dirname(adapter.manifest), 'src/lib.rs');
  const firstGeneration = readFileSync(generatedSource, 'utf8');
  adapter.cleanup();
  adapter = prepareAdapter(project);
  assert.equal(readFileSync(path.join(path.dirname(adapter.manifest), 'src/lib.rs'), 'utf8'), firstGeneration, 'Regeneration must not depend on maintained intermediates.');
  assert.deepEqual(snapshot(producer), producerSnapshot);
  const manifest = adapter.manifest;
  run('cargo', ['build', '--locked', '--offline', '--lib', '--manifest-path', manifest, '--target-dir', target]);
  const nativeLibrary = path.join(evidenceDirectory, 'libordinary_tauri_fixture_lib.dylib');
  cpSync(path.join(target, 'debug/libordinary_tauri_fixture_lib.dylib'), nativeLibrary);
  const requests = [
    { command: 'describe', payload: { request: { displayName: '한글 🦀', values: [2, 3, 5] } } },
    { command: 'describe', payload: { request: { displayName: '', values: [] } } },
    { command: 'greet', payload: { displayName: 'Ada' } },
    { command: 'unregistered', payload: {} },
    { command: 'greet', payload: { displayName: 42 } },
    { command: 'greet', payload: {} },
    { command: 'greet', payload: { displayName: null } },
    { command: 'optional', payload: {} },
    { command: 'optional', payload: { displayName: null } },
    { command: 'optional', payload: { displayName: 'present' } },
    { command: 'nothing', payload: {} },
    { command: 'select', payload: { selection: { type: 'display-name', data: '한글' } } },
    { command: 'select', payload: { selection: { type: 'no-selection' } } },
    { command: 'select', payload: { selection: { type: 'unknown' } } },
  ];
  const requestFile = path.join(work, 'requests.json');
  writeFileSync(requestFile, JSON.stringify(requests));
  const nativeHost = path.join(evidenceDirectory, 'NativeHost');
  run('xcrun', ['swiftc', '-swift-version', '5', path.join(here, 'NativeHost.swift'), '-o', nativeHost]);
  const output = run(nativeHost, [nativeLibrary, adapter.frontendDist, requestFile], { timeout: 45000 });
  const native = JSON.parse(output.trim());
  assert.equal(native.responses, native.frees, 'Every native response must have exactly one matching free');
  assert.ok(native.responses >= 10000, 'The native ownership stress loop must execute');
  native.direct = native.direct.map(({ abiVersion, ...response }: { abiVersion: number; ok: boolean; value?: unknown; error?: unknown }) => {
    assert.equal(abiVersion, 2, 'Every generated response must identify its ABI');
    return response;
  });
  const bridgeSources = [path.join(root, 'packages/react-native/ios/TNTauriRustBridge.mm'), path.join(root, 'packages/lynx/ios/src/TNTauriLynxRustBridge.mm')];
  const bridgeArgs = ['clang++', '-std=c++17', '-fobjc-arc', '-framework', 'Foundation', '-I', path.dirname(adapter.header), ...bridgeSources.flatMap(file => ['-I', path.dirname(file)]), ...bridgeSources, path.join(here, 'BridgeHost.mm')];
  const bridgeHost = path.join(work, 'BridgeHost');
  run('xcrun', [...bridgeArgs, nativeLibrary, '-o', bridgeHost]);
  run(bridgeHost, []);
  const incompatible = path.join(work, 'incompatible.c');
  const incompatibleLibrary = path.join(work, 'libincompatible.dylib');
  writeFileSync(incompatible, '#include <stdint.h>\n#include <stdlib.h>\nuint32_t tauri_native_abi_version(void) { return 99; }\nchar *tauri_native_invoke(const char *a, const char *b) { abort(); }\nvoid tauri_native_string_free(char *p) { abort(); }\nuint64_t tauri_native_session_create(void) { abort(); }\nchar *tauri_native_session_start(uint64_t s,const char*i,const char*c,const char*p) { abort(); }\nchar *tauri_native_session_poll(uint64_t s) { abort(); }\nvoid tauri_native_session_cancel(uint64_t s,const char*i) { abort(); }\nvoid tauri_native_session_destroy(uint64_t s) { abort(); }\n');
  run('xcrun', ['clang', '-dynamiclib', incompatible, '-o', incompatibleLibrary]);
  run('xcrun', [...bridgeArgs, incompatibleLibrary, '-o', bridgeHost]);
  run(bridgeHost, ['--incompatible']);
  const changedRegistry = path.join(work, 'changed-registry');
  cpSync(fixture, changedRegistry, { recursive: true });
  symlinkSync(exampleModules, path.join(changedRegistry, 'node_modules'), 'dir');
  const registeredText = sourceText.replace('tauri::generate_handler![', 'tauri::generate_handler![unregistered, ');
  assert.notEqual(registeredText, sourceText);
  writeFileSync(path.join(changedRegistry, 'src-tauri/src/lib.rs'), registeredText);
  const registeredSnapshot = snapshot(changedRegistry);
  const changedAdapter = prepareAdapter(discoverProject('src-tauri', changedRegistry));
  try {
    run('cargo', ['build', '--lib', '--locked', '--offline', '--manifest-path', changedAdapter.manifest, '--target-dir', target]);
    const changedLibrary = path.join(work, 'libchanged.dylib');
    cpSync(path.join(target, 'debug/libordinary_tauri_fixture_lib.dylib'), changedLibrary);
    const changed = JSON.parse(run(nativeHost, [changedLibrary, changedAdapter.frontendDist, requestFile], { timeout: 45000 }).trim());
    assert.deepEqual(changed.direct[3], { abiVersion: 2, ok: true, value: 'This function is deliberately not registered' });
    assert.equal(changed.frontend.unregisteredRejected, undefined, 'The ordinary frontend must see the registration change too');
    assert.deepEqual(snapshot(changedRegistry), registeredSnapshot);
  } finally { changedAdapter.cleanup(); }
  const broken = path.join(work, 'compiler-failure');
  cpSync(fixture, broken, { recursive: true });
  symlinkSync(exampleModules, path.join(broken, 'node_modules'), 'dir');
  const brokenText = sourceText + '\nfn invalid_return() -> u32 { "not a number" }\n';
  const brokenLine = brokenText.split('\n').findIndex(line => line.startsWith('fn invalid_return')) + 1;
  writeFileSync(path.join(broken, 'src-tauri/src/lib.rs'), brokenText);
  const brokenSnapshot = snapshot(broken);
  const brokenAdapter = prepareAdapter(discoverProject('src-tauri', broken));
  try {
    const failure = spawnSync('cargo', ['build', '--lib', '--locked', '--offline', '--manifest-path', brokenAdapter.manifest, '--target-dir', target], { encoding: 'utf8' });
    assert.equal(failure.status, 101, 'The invalid Rust body must fail actual compilation');
    assert.match(failure.stderr, /E0308/);
    assert.ok(failure.stderr.includes(`src/lib.rs:${brokenLine}:`), 'Compiler errors must retain the original source line');
    assert.deepEqual(snapshot(broken), brokenSnapshot, 'Compilation failure must preserve authored source');
  } finally { brokenAdapter.cleanup(); }
  assert.deepEqual(native.direct[0], { ok: true, value: { displayName: '한글 🦀', total: 10 } });
  assert.deepEqual(native.direct[1], { ok: false, error: { kind: 'empty_name', message: 'A name is required' } });
  assert.deepEqual(native.frontend, {
    success: native.direct[0].value,
    error: native.direct[1].error,
    camelCase: 'Hello, Ada!',
    unregisteredRejected: true,
    absent: null, explicitNull: null, unit: null,
    selection: { type: 'display-name', data: '한글' },
  });

  // Build the untouched desktop app. Test Tauri's real command macros separately;
  // MockRuntime exists only in this test copy, never in the exported native ABI.
  const producerManifest = path.join(producer, 'src-tauri/Cargo.toml');
  run('cargo', ['build', '--locked', '--offline', '--bin', 'ordinary-tauri-fixture', '--manifest-path', producerManifest, '--target-dir', target]);
  const publicProbe = path.join(work, 'public-api-probe');
  mkdirSync(path.join(publicProbe, 'src'), { recursive: true });
  writeFileSync(path.join(publicProbe, 'Cargo.toml'), `[package]\nname = "public-api-probe"\nversion = "0.0.0"\nedition = "2021"\n[workspace]\n[dependencies]\nordinary-tauri-fixture = { path = ${JSON.stringify(path.dirname(producerManifest))} }\ntauri = "=2.11.5"\n`);
  writeFileSync(path.join(publicProbe, 'src/main.rs'), 'fn main() { let _ = ordinary_tauri_fixture_lib::greet("Ada".into()); let _ = tauri::ipc::InvokeMessage::<tauri::Wry>::new; }');
  const publicResult = spawnSync('cargo', ['check', '--offline', '--manifest-path', path.join(publicProbe, 'Cargo.toml'), '--target-dir', target], { encoding: 'utf8' });
  assert.equal(publicResult.status, 101);
  assert.match(publicResult.stderr, /E0603[\s\S]*greet[\s\S]*private/);
  assert.match(publicResult.stderr, /E0624[\s\S]*new[\s\S]*private/);
  const desktop = path.join(work, 'desktop-parity');
  cpSync(producer, desktop, { recursive: true, filter: (name) => path.basename(name) !== 'node_modules' });
  const desktopSource = path.join(desktop, 'src-tauri/src/lib.rs');
  writeFileSync(desktopSource, sourceText + '\n' + readFileSync(path.join(here, 'desktop-parity.rs'), 'utf8'));
  const desktopManifest = path.join(desktop, 'src-tauri/Cargo.toml');
  writeFileSync(desktopManifest, readFileSync(desktopManifest, 'utf8').replace('tauri = { version = "=2.11.5", features = [] }', 'tauri = { version = "=2.11.5", features = ["test"] }'));
  const desktopResult = path.join(work, 'desktop-result.json');
  run('cargo', ['test', '--locked', '--offline', '--lib', '--manifest-path', desktopManifest, '--target-dir', target, 'export_parity::original_tauri_handler'], {
    env: { ...process.env, SPIKE_REQUESTS: requestFile, SPIKE_DESKTOP_RESULT: desktopResult },
  });
  assert.deepEqual(native.direct, JSON.parse(readFileSync(desktopResult, 'utf8')), 'Generated ABI must match the real Tauri command handler.');

  assert.deepEqual(snapshot(producer), producerSnapshot, 'Success/failure/build paths must preserve producer files.');
  run('git', ['diff', '--exit-code'], { cwd: producer });
  assert.deepEqual(snapshot(fixture), originalSnapshot, 'The checked-in fixture must be untouched.');
  const report = {
    decision: 'go for the explicitly restricted synchronous root-command subset',
    rust: run('rustc', ['--version']).trim(),
    tauri: '2.11.5', tauriApi: '2.11.1', vite: '8.2.2',
    native: native.direct, frontend: native.frontend,
    desktopCommandParity: true, desktopBuild: true,
    publicApiProbe: { privateCommand: 'E0603', invokeMessageConstructor: 'E0624' },
    producerUnchanged: true, regeneratedFromSource: true,
    sourceHashes: originalSnapshot,
    abiVersion: 2, responses: native.responses, frees: native.frees,
    objcConsumers: ['react-native', 'lynx'], incompatibleAbiRejected: true,
    compilerFailureSourceUnchanged: true, compilerFailureOriginalLine: brokenLine,
    registrationChangeExecuted: true,
    limits: ['This command verifies macOS; mobile export has separate platform gates', 'Desktop IPC parity uses Tauri MockRuntime only in the test copy'],
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: native calls, unchanged frontend, Tauri handler parity and source integrity. Evidence: ${reportPath}`);
} finally {
  try { assert.deepEqual(snapshot(fixture), originalSnapshot); }
  finally { adapter?.cleanup(); rmSync(work, { recursive: true, force: true }); }
}
