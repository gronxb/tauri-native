import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inventory, sha256 } from '../src/artifacts/files.ts';
// @ts-expect-error The shared helper prepares structural receipts, not native binaries.
import { writeTestArtifacts } from '../../../scripts/test-artifacts.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const cli = path.join(root, 'packages/cli/dist/index.mjs');
const fixture = path.join(root, 'packages/cli/test/fixtures/standard-tauri');
const work = mkdtempSync(path.join(tmpdir(), 'doctor scenarios '));
const tools = path.join(work, 'tools');
const stateFile = path.join(work, 'tools.json');
const logFile = path.join(work, 'calls.jsonl');
const clang = path.join(work, 'ndk/toolchains/llvm/prebuilt/host/bin/clang');
const host = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
assert.equal(host.status, 0, 'Doctor source scenarios require an installed Rust compiler for preparing the actual inspector.');
const cargo = spawnSync('which', ['cargo'], { encoding: 'utf8' }).stdout.trim();
const originalPath = process.env.PATH;
const require = createRequire(import.meta.url);
const readers = ['react-native/artifacts.js', 'lynx/artifacts.cjs'].map(file => require(path.join(root, 'packages', file)).readArtifacts);
const androidTargets = 'aarch64-linux-android\narmv7-linux-androideabi\ni686-linux-android\nx86_64-linux-android';

function configure(value = {}) { writeFileSync(stateFile, JSON.stringify(value)); writeFileSync(logFile, ''); }
function executable(file: string, body: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!${process.execPath}\n${body}`, { mode: 0o755 });
}
function snapshot(directory: string): Record<string, string> {
  return Object.fromEntries(readdirSync(directory, { recursive: true, withFileTypes: true }).filter(item => item.isFile()).map(item => {
    const file = path.join(item.parentPath, item.name);
    return [path.relative(directory, file), createHash('sha256').update(readFileSync(file)).digest('hex')];
  }));
}
function producer(name: string) { const directory = path.join(work, name); cpSync(fixture, directory, { recursive: true }); return directory; }
function run(args: string[], cwd = work, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env: { ...process.env, PATH: tools, ...env } });
  return result;
}
function doctor(args: string[], cwd = work, env: NodeJS.ProcessEnv = {}) {
  const result = run(['doctor', ...args, '--json'], cwd, env);
  assert.equal(result.stderr, '', result.stderr);
  return { ...result, report: JSON.parse(result.stdout) };
}
function editReceipt(directory: string, change: (value: any) => void) {
  const file = path.join(directory, 'manifest.json'); const value = JSON.parse(readFileSync(file, 'utf8'));
  change(value); writeFileSync(file, JSON.stringify(value));
}
function assertReadOnlyCalls() {
  const calls = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert(calls.length > 0);
  for (const call of calls) {
    assert.equal(call.autoInstall, '0'); assert.equal(call.offline, 'true');
    assert(!call.args.includes('build') && !call.args.includes('install') && !call.args.includes('add'), JSON.stringify(call));
  }
}

before(() => {
  const prepared = spawnSync(process.execPath, [cli, 'inspect', '--tauri-dir', path.join(fixture, 'src-tauri'), '--json'], { encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr);
  const prefix = `const fs=require('node:fs');const state=JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}));const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(logFile)},JSON.stringify({tool:require('node:path').basename(process.argv[1]),args,autoInstall:process.env.RUSTUP_AUTO_INSTALL,offline:process.env.CARGO_NET_OFFLINE})+'\\n');\n`;
  executable(path.join(tools, 'rustc'), prefix + `console.log(args[0]==='-vV'?${JSON.stringify(host.stdout)}:'rustc 1.97.1');`);
  executable(path.join(tools, 'rustup'), prefix + `console.log(state.missingTargets?'aarch64-apple-darwin':${JSON.stringify(androidTargets)});`);
  executable(path.join(tools, 'cargo'), prefix + `
    if(args[0]==='metadata'){const r=require('node:child_process').spawnSync(${JSON.stringify(cargo)},args,{encoding:'utf8',env:{...process.env,PATH:${JSON.stringify(originalPath)}}});process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);}
    if(args[0]==='--version')console.log('cargo 1.97.1');
    else if(args[0]==='ndk'&&args[1]==='--version')console.log('cargo-ndk 4.1.2');
    else if(args[0]==='ndk-env'){if(state.missingNdk){console.error('SECRET_MUST_NOT_APPEAR');process.exit(1);}console.log(JSON.stringify({CLANG_PATH:state.incompleteNdk?${JSON.stringify(path.join(work, 'incomplete-ndk/bin/clang'))}:${JSON.stringify(clang)}}));}
    else {console.error('Unexpected tool invocation');process.exit(98);}`);
  executable(clang, prefix + "console.log('Android clang 18');");
  writeFileSync(path.join(path.dirname(clang), 'llvm-readelf'), 'fixture tool');
  mkdirSync(path.join(work, 'ndk/meta'), { recursive: true }); writeFileSync(path.join(work, 'ndk/meta/system_libs.json'), '{}');
  configure();
});
after(() => rmSync(work, { recursive: true, force: true }));

test('artifact-only diagnosis survives relocation without source or any Rust tools and keeps JSON stable', async () => {
  configure(); const source = path.join(work, 'export'); const copy = path.join(work, 'Independent Host/Native Artifacts');
  await writeTestArtifacts(source, 'ios'); cpSync(source, copy, { recursive: true }); rmSync(source, { recursive: true });
  const before = snapshot(copy);
  const first = doctor(['--artifacts', copy], work, { PATH: '/no-tools' });
  assert.equal(first.status, 0); assert.equal(first.report.mode, 'artifacts'); assert.equal(first.report.freshness.status, 'unknown');
  assert.equal(doctor(['--artifacts', copy], work, { PATH: '/no-tools', COLUMNS: '24', NO_COLOR: '1' }).stdout, first.stdout);
  assert.deepEqual(snapshot(copy), before); assert.equal(readFileSync(logFile, 'utf8'), '');
});

test('doctor and both host readers distinguish corrupt, missing, incompatible and linked members', async () => {
  const directory = path.join(work, 'broken export');
  const cases: [string, () => void][] = [
    ['artifact_abi', () => editReceipt(directory, value => { value.abiVersion = 99; })],
    ['artifact_api', () => editReceipt(directory, value => { value.minimumApiLevel = 30; })],
    ['artifact_alignment', () => editReceipt(directory, value => { value.pageSize = 4096; })],
    ['artifact_checksum', () => writeFileSync(path.join(directory, 'assets/tauri-native/index.html'), 'corrupt')],
    ['artifact_missing_file', () => rmSync(path.join(directory, 'jniLibs/x86/libtauri_native_core.so'))],
    ['artifact_symlink', () => symlinkSync('/outside', path.join(directory, 'link'))],
    ['artifact_json', () => writeFileSync(path.join(directory, 'manifest.json'), '{')],
  ];
  for (const [code, damage] of cases) {
    await writeTestArtifacts(directory, 'android'); damage(); const before = snapshot(directory);
    const result = doctor(['--artifacts', directory], work, { PATH: '/no-tools' });
    assert.equal(result.status, 1, code); assert.equal(result.report.checks[0].code, code);
    for (const read of readers) assert.throws(() => read(directory, 'android'), { code });
    assert.deepEqual(snapshot(directory), before);
  }
  await writeTestArtifacts(directory, 'android');
  assert.equal(doctor(['--artifacts', directory, '--platform', 'ios']).report.checks[0].code, 'artifact_platform');
});

test('producer diagnosis uses actual command discovery without build hooks, installs or source mutation', () => {
  configure(); const directory = producer('ordinary source with spaces');
  const config = path.join(directory, 'src-tauri/tauri.conf.json');
  const value = JSON.parse(readFileSync(config, 'utf8')); value.build.beforeBuildCommand = 'this-build-hook-must-never-run'; writeFileSync(config, JSON.stringify(value));
  const before = snapshot(directory); const result = doctor(['--platform', 'android'], directory);
  assert.equal(result.status, 0, result.stdout); assert.equal(result.report.checks.find((item: any) => item.id === 'project').code, 'ok');
  assert.deepEqual(snapshot(directory), before); assertReadOnlyCalls();
});

test('missing targets, NDK and compiler have actionable independent diagnostics without leaking stderr', () => {
  const directory = producer('missing tools');
  for (const [state, code] of [[{ missingTargets: true }, 'rust_target_missing'], [{ missingNdk: true }, 'ndk_unavailable'], [{ incompleteNdk: true }, 'ndk_incomplete']] as const) {
    configure(state); const before = snapshot(directory); const result = doctor(['--platform', 'android'], directory);
    assert.equal(result.status, 1, result.stdout); assert(result.report.checks.some((item: any) => item.code === code));
    assert(!result.stdout.includes('SECRET_MUST_NOT_APPEAR')); assert.deepEqual(snapshot(directory), before); assertReadOnlyCalls();
  }
  configure(); const compiler = readFileSync(clang); rmSync(clang);
  try {
    const missingCompiler = doctor(['--platform', 'android'], directory);
    assert.equal(missingCompiler.status, 1);
    assert.equal(missingCompiler.report.checks.find((item: any) => item.id === 'android-ndk').code, 'ndk_compiler_missing');
    assertReadOnlyCalls();
  } finally { writeFileSync(clang, compiler, { mode: 0o755 }); }
  const missing = doctor(['--platform', 'android'], directory, { PATH: '/no-tools' });
  assert.equal(missing.status, 1); assert.equal(missing.report.checks.find((item: any) => item.id === 'rustc').code, 'tool_missing');
});

test('a cold inspector cache is diagnosed instead of compiled, and unsupported commands retain source locations', () => {
  configure(); const directory = producer('unprepared inspector'); const cold = path.join(work, 'empty cache'); mkdirSync(cold);
  const result = doctor(['--platform', 'android'], directory, { TMPDIR: cold, TMP: cold, TEMP: cold });
  assert.equal(result.status, 1); assert.equal(result.report.checks.find((item: any) => item.id === 'project').code, 'inspector_not_prepared');
  assert.deepEqual(readdirSync(cold), []); assertReadOnlyCalls();
  configure();
  cpSync(path.join(root, 'packages/cli/test/fixtures/compatibility/module'), directory, { recursive: true });
  const before = snapshot(directory); const unsupported = doctor(['--platform', 'android'], directory);
  const project = unsupported.report.checks.find((item: any) => item.id === 'project');
  assert.equal(unsupported.status, 1); assert.equal(project.code, 'project_unsupported');
  assert(project.diagnostics[0].line > 0); assert(project.diagnostics[0].file.endsWith('src/lib.rs'));
  assert.deepEqual(snapshot(directory), before);
});

test('source freshness compares only recorded evidence and never claims that an unbuilt frontend is fresh', async () => {
  configure(); const directory = producer('fingerprinted source'); const artifacts = path.join(work, 'fingerprinted artifacts');
  await writeTestArtifacts(artifacts, 'android');
  const source = path.join(directory, 'src-tauri/src/lib.rs'); const original = readFileSync(source);
  editReceipt(artifacts, value => { value.source = { rustEntrySha256: createHash('sha256').update(original).digest('hex') }; });
  const args = ['--tauri-dir', path.join(directory, 'src-tauri'), '--artifacts', artifacts, '--platform', 'android'];
  assert.equal(doctor(args).report.freshness.status, 'recorded_inputs_match');
  writeFileSync(source, Buffer.concat([original, Buffer.from('\n// Changed authored source.\n')]));
  const changed = doctor(args); assert.equal(changed.status, 1); assert.deepEqual(changed.report.freshness.changed, ['rustEntrySha256']);
  writeFileSync(source, original); writeFileSync(path.join(directory, 'src/main.js'), 'authored frontend changed but has not been built');
  const unbuilt = doctor(args); assert.equal(unbuilt.status, 0); assert.equal(unbuilt.report.freshness.status, 'recorded_inputs_match');
  assert.match(unbuilt.report.freshness.note, /do not prove/); assertReadOnlyCalls();
  const dist = path.join(directory, 'dist'); mkdirSync(dist, { recursive: true }); writeFileSync(path.join(dist, 'index.html'), 'built frontend');
  editReceipt(artifacts, value => { value.source.frontendSha256 = sha256(JSON.stringify(inventory(dist))); });
  assert.equal(doctor(args).report.freshness.status, 'recorded_inputs_match');
  writeFileSync(path.join(dist, 'index.html'), 'changed built frontend');
  const frontendChanged = doctor(args); assert.equal(frontendChanged.status, 1);
  assert.deepEqual(frontendChanged.report.freshness.changed, ['frontendSha256']);
});

test('export shares tool preflight failures before invoking frontend hooks or changing the previous output', async () => {
  configure({ missingNdk: true }); const directory = producer('early export failure');
  const output = path.join(directory, 'previous export'); await writeTestArtifacts(output, 'android');
  const before = snapshot(directory);
  const result = run(['export', 'android', '--output-dir', output], directory);
  assert.equal(result.status, 1); assert.match(result.stderr, /ndk_unavailable/);
  assert.deepEqual(snapshot(directory), before);
  const calls = readFileSync(logFile, 'utf8'); assert(!calls.includes('"build"') && !calls.includes('"add"'));
});

test('packed CLI and host readers diagnose a copied receipt outside the checkout with no tools on PATH', async () => {
  const consumer = path.join(work, 'Packed Consumer'); mkdirSync(consumer);
  const artifacts = path.join(consumer, 'artifacts'); await writeTestArtifacts(artifacts, 'android');
  function prepare(command: string, args: string[]) {
    const result = spawnSync(command, args, { cwd: consumer, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); return result.stdout;
  }
  for (const name of ['cli', 'react-native', 'lynx']) {
    const packed = JSON.parse(prepare('npm', ['pack', path.join(root, 'packages', name), '--ignore-scripts', '--json', '--pack-destination', consumer]));
    const tarball = path.join(consumer, packed[0].filename);
    if (name === 'cli') {
      writeFileSync(path.join(consumer, 'package.json'), '{"private":true}');
      prepare('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
    } else {
      mkdirSync(path.join(consumer, name));
      prepare('tar', ['-xf', tarball, '-C', name, '--strip-components=1']);
    }
  }
  const packedCli = path.join(consumer, 'node_modules/@tauri-native/cli/dist/index.mjs');
  for (const corrupt of [false, true]) {
    if (corrupt) writeFileSync(path.join(artifacts, 'assets/tauri-native/index.html'), 'changed after copying');
    const result = spawnSync(process.execPath, [packedCli, 'doctor', '--artifacts', artifacts, '--json'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, PATH: '/no-tools' } });
    assert.equal(result.status, corrupt ? 1 : 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).checks[0].code, corrupt ? 'artifact_checksum' : 'ok');
    for (const file of ['react-native/artifacts.js', 'lynx/artifacts.cjs']) {
      const script = `const {readArtifacts}=require(${JSON.stringify(path.join(consumer, file))});try{process.stdout.write(readArtifacts(${JSON.stringify(artifacts)}).platform);}catch(error){process.stdout.write(error.code);process.exitCode=1;}`;
      const reader = spawnSync(process.execPath, ['-e', script], { cwd: consumer, encoding: 'utf8', env: { ...process.env, PATH: '/no-tools' } });
      assert.equal(reader.status, corrupt ? 1 : 0, reader.stderr);
      assert.equal(reader.stdout, corrupt ? 'artifact_checksum' : 'android');
    }
  }
});
