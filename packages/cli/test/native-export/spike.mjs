import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const fixture = path.resolve(here, '../fixtures/standard-tauri');
const target = path.join(root, 'target');
const evidenceDirectory = path.join(target, 'export-spike');
const generatorManifest = path.join(here, 'generator/Cargo.toml');
const generatorTarget = path.join(target, 'export-spike-generator');
const generator = path.join(generatorTarget, 'debug/tauri-native-export-spike');

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command} failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function snapshot(directory, prefix = '') {
  const files = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'target', 'gen'].includes(entry.name)) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, snapshot(absolute, relative));
    else files[relative] = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  }
  return files;
}

assert.equal(process.platform, 'darwin', 'The M0 proof requires macOS, Xcode, Rust and the installed example JS dependencies.');
mkdirSync(evidenceDirectory, { recursive: true });
const reportPath = path.join(evidenceDirectory, 'report.json');
rmSync(reportPath, { force: true });
const work = mkdtempSync(path.join(tmpdir(), 'tauri native export spike '));
const originalSnapshot = snapshot(fixture);
try {
  const producer = path.join(work, 'producer');
  cpSync(fixture, producer, { recursive: true });
  const producerSnapshot = snapshot(producer);
  const exampleModules = path.join(root, 'examples/tauri/node_modules');
  const expected = JSON.parse(readFileSync(path.join(fixture, 'package.json'), 'utf8'));
  for (const name of ['@tauri-apps/api', 'vite']) {
    const installed = JSON.parse(readFileSync(path.join(exampleModules, name, 'package.json'), 'utf8'));
    assert.equal(installed.version, expected.dependencies[name] ?? expected.devDependencies[name], `Install the fixture's pinned ${name} version before running this proof.`);
  }
  symlinkSync(exampleModules, path.join(producer, 'node_modules'), 'dir');
  run(process.execPath, [path.join(exampleModules, 'vite/bin/vite.js'), 'build'], { cwd: producer });
  run('cargo', ['build', '--locked', '--offline', '--manifest-path', generatorManifest, '--target-dir', generatorTarget]);

  const source = path.join(producer, 'src-tauri/src/lib.rs');
  const sourceText = readFileSync(source, 'utf8');
  const generated = path.join(work, 'generated');
  cpSync(producer, generated, { recursive: true, filter: (name) => path.basename(name) !== 'node_modules' });
  const generatedSource = path.join(generated, 'src-tauri/src/lib.rs');
  run(generator, [source, generatedSource]);
  const firstGeneration = readFileSync(generatedSource, 'utf8');
  rmSync(generated, { recursive: true });
  cpSync(producer, generated, { recursive: true, filter: (name) => path.basename(name) !== 'node_modules' });
  run(generator, [source, generatedSource]);
  assert.equal(readFileSync(generatedSource, 'utf8'), firstGeneration, 'Regeneration must not depend on maintained intermediates.');
  assert.deepEqual(snapshot(producer), producerSnapshot);

  const probes = {
    async: [sourceText.replace('fn greet(', 'async fn greet('), /async command/],
    commandOptions: [sourceText.replace('#[tauri::command]\nfn greet', '#[tauri::command(rename = "greeting")]\nfn greet'), /command attribute options/],
    module: [sourceText.replace('describe, greet]', 'describe, commands::greet]') + '\nmod commands { #[tauri::command] pub fn greet(display_name: String) -> String { display_name } }', /module command registration/],
    conditional: [sourceText.replace('#[tauri::command]\nfn greet', '#[cfg(feature = "greeting")]\n#[tauri::command]\nfn greet').replace('describe, greet]', 'describe, #[cfg(feature = "greeting")] greet]'), /conditional\/custom registration/],
    state: [sourceText.replace('display_name: String) -> String', 'state: tauri::State<\'_, String>) -> String').replace('format!("Hello, {display_name}!")', 'state.inner().clone()'), /runtime\/state\/plugin-dependent/],
    appHandle: [sourceText.replace('display_name: String) -> String', 'app: tauri::AppHandle) -> String').replace('format!("Hello, {display_name}!")', 'app.package_info().name.clone()'), /runtime\/state\/plugin-dependent/],
    window: [sourceText.replace('display_name: String) -> String', 'window: tauri::WebviewWindow) -> String').replace('format!("Hello, {display_name}!")', 'window.label().into()'), /runtime\/state\/plugin-dependent/],
    plugin: [sourceText.replace('.invoke_handler(', '.plugin(tauri::plugin::Builder::new("probe").build())\n        .invoke_handler('), /initialization is not supported/],
    initialization: [sourceText.replace('.invoke_handler(', '.manage(String::new())\n        .invoke_handler('), /initialization is not supported/],
    customContext: [sourceText.replace('.run(tauri::generate_context!())', '.run({ println!("initializing context"); tauri::generate_context!() })'), /custom context initialization/],
  };
  for (const [name, [text, diagnostic]] of Object.entries(probes)) {
    const input = path.join(work, `${name}.rs`);
    const output = path.join(work, `${name}-generated.rs`);
    writeFileSync(input, text);
    const before = readFileSync(input);
    const result = spawnSync(generator, [input, output], { encoding: 'utf8' });
    assert.equal(result.status, 1, `${name} must fail explicitly`);
    assert.match(result.stderr, diagnostic);
    assert.equal(existsSync(output), false, `${name} must not publish partial output`);
    assert.deepEqual(readFileSync(input), before);
  }

  const manifest = path.join(generated, 'src-tauri/Cargo.toml');
  run('cargo', ['build', '--locked', '--offline', '--lib', '--manifest-path', manifest, '--target-dir', target]);
  const nativeLibrary = path.join(evidenceDirectory, 'libordinary_tauri_fixture_lib.dylib');
  cpSync(path.join(target, 'debug/libordinary_tauri_fixture_lib.dylib'), nativeLibrary);
  const requests = [
    { command: 'describe', payload: { request: { displayName: '한글 🦀', values: [2, 3, 5] } } },
    { command: 'describe', payload: { request: { displayName: '', values: [] } } },
    { command: 'greet', payload: { displayName: 'Ada' } },
    { command: 'unregistered', payload: {} },
    { command: 'greet', payload: { displayName: 42 } },
  ];
  const requestFile = path.join(work, 'requests.json');
  writeFileSync(requestFile, JSON.stringify(requests));
  const nativeHost = path.join(evidenceDirectory, 'NativeHost');
  run('xcrun', ['swiftc', '-swift-version', '5', path.join(here, 'NativeHost.swift'), '-o', nativeHost]);
  const output = run(nativeHost, [nativeLibrary, path.join(generated, 'dist'), requestFile], { timeout: 45000 });
  const native = JSON.parse(output.trim());
  assert.deepEqual(native.direct[0], { ok: true, value: { displayName: '한글 🦀', total: 10 } });
  assert.deepEqual(native.direct[1], { ok: false, error: { kind: 'empty_name', message: 'A name is required' } });
  assert.deepEqual(native.frontend, {
    success: native.direct[0].value,
    error: native.direct[1].error,
    camelCase: 'Hello, Ada!',
    unregisteredRejected: true,
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
    blockedProbes: Object.keys(probes),
    limits: ['macOS native/WKWebView proof; iOS/Android export remains unverified', 'No public CLI behavior changed; generator is opt-in test tooling', 'Desktop IPC parity uses Tauri MockRuntime only in the test copy'],
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: native calls, unchanged frontend, Tauri handler parity and source integrity. Evidence: ${reportPath}`);
} finally {
  assert.deepEqual(snapshot(fixture), originalSnapshot);
  rmSync(work, { recursive: true, force: true });
}
