import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory } from '../../src/artifacts/files.ts';
import { validateIosArtifacts } from '../../src/artifacts/ios.ts';
import { androidTools, validateAndroidArtifacts } from '../../src/artifacts/android.ts';
import { snapshot } from '../native-export/source-integrity.mjs';
import { waitForDesktopReport } from '../native-export/desktop-report.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const changedRust = process.env.FIELDNOTES_CHANGED_RUST === '1';
const evidence = path.join(root, changedRust ? 'target/document-feature-changed' : 'target/document-feature');
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-feature-'));
const producer = path.join(work, 'ordinary producer');
const desktopCopy = path.join(work, 'desktop probe');
const timings = {};
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const started = performance.now();
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  if (options.measure) timings[options.measure] = Math.round(performance.now() - started);
  return result.stdout;
}
assert.equal(process.platform, 'darwin', 'Requires macOS, Xcode, Rust mobile targets and Android NDK.');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'export-report.json'), { force: true });
let desktop, dataDirectory;
try {
  const source = path.join(root, 'examples/ordinary-tauri-feature');
  cpSync(source, producer, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).some(part => ['node_modules', 'target', 'gen', 'dist'].includes(part)) });
  if (changedRust) {
    // A controlled edit in the disposable producer, never the canonical example.
    const file = path.join(producer, 'src-tauri/src/lib.rs');
    const original = readFileSync(file, 'utf8');
    const search = 'fn search_documents(directory: String, query: String) -> Result<Vec<Document>, String> {';
    assert(original.includes(search) && original.includes('Use a title between'));
    writeFileSync(file, original.replace('Use a title between', 'Enter a title between')
      .replace(search, search + '\n    if query == "__pending__" { std::thread::sleep(std::time::Duration::from_secs(20)); }'));
  }
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer, measure: 'producerInstallMs' });
  run('npm', ['run', 'build'], { cwd: producer, measure: 'frontendBuildMs' });
  run('cargo', ['test', '--offline', '--manifest-path', path.join(producer, 'src-tauri/Cargo.toml'), '--target-dir', path.join(root, 'target')]);
  const before = snapshot(producer);
  const frontend = inventory(path.join(producer, 'dist'));

  // Only the desktop probe receives a test command/DOM driver. Export the untouched producer.
  cpSync(producer, desktopCopy, { recursive: true, filter: file => !path.relative(producer, file).split(path.sep).some(part => ['node_modules', 'target'].includes(part)) });
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: desktopCopy });
  const configFile = path.join(desktopCopy, 'src-tauri/tauri.conf.json');
  const config = JSON.parse(readFileSync(configFile));
  config.identifier = `dev.taurinative.fieldnotes.qa${process.pid}`;
  writeFileSync(configFile, JSON.stringify(config));
  const rust = path.join(desktopCopy, 'src-tauri/src/lib.rs');
  writeFileSync(rust, readFileSync(rust, 'utf8').replace('generate_handler![save_document, search_documents]', 'generate_handler![save_document, search_documents, qa_record]') + '\n#[tauri::command]\nfn qa_record(report: String) { std::fs::write(std::env::var("TAURI_FEATURE_REPORT").unwrap(), report).unwrap(); }\n');
  const main = path.join(desktopCopy, 'src/main.js');
  writeFileSync(main, readFileSync(main, 'utf8') + '\nimport "./desktop-probe.js";\n');
  const parity = [];
  for (const phase of ['save', 'relaunch']) {
    writeFileSync(path.join(desktopCopy, 'src/desktop-probe.js'), readFileSync(new URL('./desktop-probe.js', import.meta.url), 'utf8').replace('__PHASE__', phase).replace('__TITLE_VERB__', changedRust ? 'Enter' : 'Use'));
    run('npm', ['run', 'build'], { cwd: desktopCopy });
    run('cargo', ['build', '--offline', '--manifest-path', path.join(desktopCopy, 'src-tauri/Cargo.toml'), '--features', 'tauri/custom-protocol', '--target-dir', path.join(root, 'target')], { measure: `desktop${phase}BuildMs` });
    const report = path.join(evidence, `desktop-${phase}.json`);
    rmSync(report, { force: true });
    desktop = spawn(path.join(root, 'target/debug/ordinary-tauri-documents'), [], { cwd: desktopCopy, env: { ...process.env, TAURI_FEATURE_REPORT: report }, stdio: 'inherit' });
    const result = await waitForDesktopReport(report, desktop);
    assert.equal(result.passed, true, JSON.stringify(result));
    dataDirectory = result.directory;
    assert.equal(path.basename(dataDirectory), config.identifier);
    parity.push(result);
    const exited = new Promise(resolve => desktop.once('exit', resolve));
    desktop.kill(); await exited; desktop = undefined;
  }
  assert.equal(parity[0].directory, parity[1].directory, 'relaunch opens the same persistent directory');

  const cli = path.join(work, 'cli'); mkdirSync(cli);
  const cliTarball = process.env.TAURI_NATIVE_CLI_TARBALL ?? path.join(work, JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]))[0].filename);
  writeFileSync(path.join(cli, 'package.json'), '{"private":true}');
  run('npm', ['install', '--prefix', cli, '--ignore-scripts', '--no-audit', '--no-fund', cliTarball]);
  const artifacts = {};
  for (const platform of ['ios', 'android']) {
    run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', platform], { cwd: producer, measure: `${platform}ExportMs` });
    const output = path.join(producer, 'src-tauri/gen/tauri-native', platform);
    if (platform === 'ios') validateIosArtifacts(output);
    else validateAndroidArtifacts(output, androidTools());
    assert.deepEqual(inventory(path.join(output, platform === 'ios' ? 'TauriNativeAssets.bundle' : 'assets/tauri-native')).filter(file => file.path !== 'Info.plist'), frontend);
    const destination = path.join(evidence, 'artifacts', platform);
    rmSync(destination, { recursive: true, force: true });
    cpSync(output, destination, { recursive: true });
    assert.deepEqual(snapshot(producer), before);
    const files = inventory(destination);
    artifacts[platform] = { files, bytes: files.reduce((sum, file) => sum + file.size, 0) };
  }
  assert.equal(readFileSync(path.join(evidence, 'artifacts/ios/commands.ts'), 'utf8'), readFileSync(path.join(evidence, 'artifacts/android/commands.ts'), 'utf8'));
  rmSync(producer, { recursive: true, force: true });
  rmSync(desktopCopy, { recursive: true, force: true });
  writeFileSync(path.join(evidence, 'export-report.json'), JSON.stringify({
    changedRust, installedCli: true, producerDeleted: true, producerUnchanged: true, frontendBytesUnchanged: true,
    desktopFrontend: parity, sourceHashes: before, artifacts, timings,
    mobileExecution: 'Separate installed RN/Expo/Lynx iOS/Android native gates required',
  }, null, 2) + '\n');
  console.log(`PASS: desktop save/search/relaunch and source-preserving portable exports. Evidence: ${evidence}/export-report.json`);
} finally {
  desktop?.kill();
  if (dataDirectory && path.basename(dataDirectory) === `dev.taurinative.fieldnotes.qa${process.pid}`) rmSync(dataDirectory, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
}
