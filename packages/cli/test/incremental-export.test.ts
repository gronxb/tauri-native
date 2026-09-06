import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { syncAdapter } from '../src/adapter/sync.ts';
import { prepareAdapter } from '../src/adapter/workspace.ts';
import { exportInputs, projectInputs } from '../src/artifacts/cache.ts';
import { discoverProject } from '../src/discovery/project.ts';
import { sha256 } from '../src/artifacts/files.ts';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temporary() { const directory = mkdtempSync(path.join(tmpdir(), 'incremental inputs ')); roots.push(directory); return directory; }
function write(directory: string, file: string, value: string) { const target = path.join(directory, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, value); return target; }
function fixture() {
  const directory = temporary(); cpSync(fileURLToPath(new URL('fixtures/standard-tauri', import.meta.url)), directory, { recursive: true });
  const project = discoverProject(path.join(directory, 'src-tauri'));
  return { directory, project, output: path.join(directory, 'copied exports/android') };
}

test('input fingerprints track file bytes, dependency contents, Cargo/config and environment changes', () => {
  const { directory, project, output } = fixture();
  write(directory, 'node_modules/local-package/index.js', 'export const value = 1');
  const before = exportInputs(project, output);
  assert.deepEqual(exportInputs(project, output), before);
  for (const relative of ['src/main.js', 'src-tauri/src/lib.rs', 'src-tauri/Cargo.lock', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json', 'package.json', 'node_modules/local-package/index.js']) {
    const file = path.join(directory, relative); const original = readFileSync(file); const info = statSync(file);
    writeFileSync(file, Buffer.concat([original, Buffer.from('\nchanged bytes')])); utimesSync(file, info.atime, info.mtime);
    assert.notDeepEqual(exportInputs(project, output), before, `${relative} must invalidate even with the same mtime`);
    writeFileSync(file, original); assert.deepEqual(exportInputs(project, output), before);
  }
  const external = temporary(); write(external, 'linked.js', 'first');
  symlinkSync(path.join(external, 'linked.js'), path.join(directory, 'src/linked.js'));
  const linked = exportInputs(project, output); write(external, 'linked.js', 'second');
  assert.notDeepEqual(exportInputs(project, output), linked);
  rmSync(path.join(directory, 'src/linked.js'));
  const previous = process.env.TAURI_NATIVE_INPUT_TEST;
  try { process.env.TAURI_NATIVE_INPUT_TEST = 'changed-build-input'; assert.notDeepEqual(exportInputs(project, output), before); }
  finally { if (previous === undefined) delete process.env.TAURI_NATIVE_INPUT_TEST; else process.env.TAURI_NATIVE_INPUT_TEST = previous; }
  const cargoHome = process.env.CARGO_HOME;
  try {
    process.env.CARGO_HOME = external; const withoutConfig = exportInputs(project, output);
    write(external, 'config.toml', '[build]\nrustflags = ["-C", "opt-level=1"]\n');
    assert.notDeepEqual(exportInputs(project, output), withoutConfig);
  } finally { if (cargoHome === undefined) delete process.env.CARGO_HOME; else process.env.CARGO_HOME = cargoHome; }
  const caller = process.cwd();
  try {
    process.chdir(external); const outsideCaller = exportInputs(project, output);
    write(external, '.cargo/config.toml', '[build]\nrustflags = ["-C", "opt-level=2"]\n');
    assert.notDeepEqual(exportInputs(project, output), outsideCaller, 'Cargo settings inherited from an external caller directory must invalidate');
  } finally { process.chdir(caller); }
});

test('generated output and caches cannot trigger a watch loop, while authored gen/target files remain inputs', () => {
  const { directory, project, output } = fixture(); const before = projectInputs(project, output);
  for (const file of ['src-tauri/target/cache/data', 'src-tauri/gen/tauri-native/android/manifest.json', 'dist/index.html', 'copied exports/android/manifest.json', 'copied exports/android.lock', 'copied exports/.android-stage-test/partial', '.git/index']) write(directory, file, 'generated');
  assert.deepEqual(projectInputs(project, output), before);
  const copy = temporary(); cpSync(directory, copy, { recursive: true });
  assert.deepEqual(projectInputs(project, output, copy), before, 'The captured producer copy must have the same authored inputs');
  write(directory, 'src/gen/authored.js', 'authored'); write(directory, 'src/target/authored.js', 'authored');
  assert.notDeepEqual(projectInputs(project, output), before);
  assert('src/gen/authored.js' in projectInputs(project, output));
  assert('src/target/authored.js' in projectInputs(project, output));
  const { build, ...frontend } = project.frontend;
  assert('dist/index.html' in projectInputs({ ...project, frontend }, output), 'Without a frontend build hook, bundled files are authored inputs');
});

test('cached adapter synchronization preserves unchanged Cargo inputs and replaces/removes changed files', () => {
  const source = temporary(); const destination = temporary(); const dependency = temporary();
  write(dependency, 'index.js', 'installed dependency');
  write(source, 'producer/src/lib.rs', 'fn unchanged() {}'); write(source, 'producer/data.txt', 'first');
  symlinkSync(dependency, path.join(source, 'producer/node_modules'));
  syncAdapter(source, destination);
  const rust = path.join(destination, 'producer/src/lib.rs'); const old = new Date('2001-01-01T00:00:00Z'); utimesSync(rust, old, old);
  write(source, 'producer/data.txt', 'second'); write(source, 'producer/new.txt', 'new');
  syncAdapter(source, destination);
  assert.equal(statSync(rust).mtimeMs, old.getTime());
  assert.equal(readFileSync(path.join(destination, 'producer/data.txt'), 'utf8'), 'second');
  rmSync(path.join(source, 'producer/new.txt')); rmSync(path.join(source, 'producer/node_modules')); syncAdapter(source, destination);
  assert.equal(existsSync(path.join(destination, 'producer/new.txt')), false);
  assert.equal(existsSync(path.join(destination, 'producer/node_modules')), false);
  assert.equal(readFileSync(path.join(dependency, 'index.js'), 'utf8'), 'installed dependency');
});

test('generation and frontend hooks use the captured producer even when the original changes immediately after copying', () => {
  const { directory } = fixture();
  const configFile = path.join(directory, 'src-tauri/tauri.conf.json'); const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.build.beforeBuildCommand = 'node build.mjs'; writeFileSync(configFile, JSON.stringify(config));
  write(directory, 'build.mjs', 'import {mkdirSync,writeFileSync} from "node:fs";mkdirSync("dist",{recursive:true});writeFileSync("dist/index.html","captured frontend");');
  const project = discoverProject(path.join(directory, 'src-tauri')); const rust = readFileSync(project.source, 'utf8'); const configHash = sha256(readFileSync(configFile));
  const adapter = prepareAdapter(project, undefined, () => {
    writeFileSync(project.source, rust.replace('Hello, {display_name}!', 'Edited after capture, {display_name}!'));
    config.build.beforeBuildCommand = 'this-new-hook-must-not-enter-the-captured-build'; writeFileSync(configFile, JSON.stringify(config));
  });
  try {
    const generated = readFileSync(path.join(path.dirname(adapter.manifest), 'src/lib.rs'), 'utf8');
    assert.match(generated, /Hello, \{display_name\}!/); assert.doesNotMatch(generated, /Edited after capture/);
    assert.equal(readFileSync(path.join(adapter.frontendDist, 'index.html'), 'utf8'), 'captured frontend');
    assert.equal(adapter.fingerprints.rustEntrySha256, sha256(rust)); assert.equal(adapter.fingerprints.tauriConfigSha256, configHash);
  } finally { adapter.cleanup(); }
});
