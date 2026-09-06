import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverProject } from '../../src/discovery/project.ts';
import { nativeTool } from '../../src/discovery/native-tool.ts';
import { prepareAdapter } from '../../src/adapter/workspace.ts';
import { generateCommands } from '../../src/types/commands.ts';
import { validateIosArtifacts } from '../../src/artifacts/ios.ts';
import { androidTools, validateAndroidArtifacts } from '../../src/artifacts/android.ts';
import { snapshot } from '../native-export/source-integrity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const evidence = path.join(root, 'target/command-types');
const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'tauri-native-types-')));
const hostEnv = { ...process.env, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin` };
const compiler = realpathSync(path.join(root, 'packages/cli/node_modules/typescript/bin/tsc'));
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const record = { display_name: '한글 🦀', pair: [true, -2], flags: [true, false], labels: { owner: 'me' } };
const samples = [
  ['save', { record }, { displayName: record.display_name, values: [], pair: record.pair, flags: record.flags, labels: record.labels }],
  ['save', { record: { ...record, display_name: '' } }, { kind: 'empty_name', message: 'A name is required' }, false],
  ['select', { selection: { type: 'no-selection' } }, { type: 'no-selection' }],
  ['select', { selection: { type: 'display-name', data: 'chosen' } }, { type: 'display-name', data: 'chosen' }],
  ['select', { selection: { type: 'pair', data: [7, true] } }, { type: 'pair', data: [7, true] }],
  ['external', { value: 'x_m_l_parser' }, 'x_m_l_parser'],
  ['external', { value: { pair: [7, true] } }, { pair: [7, true] }],
  ['external', { value: { entry: { display_name: 'name' } } }, { entry: { display_name: 'name' } }],
  ['flexible', { value: [7, true] }, [7, true]],
  ['label', { value: 'transparent' }, 'transparent'],
  ['optional', {}, null], ['optional', { displayName: null }, null], ['optional', { displayName: 'value' }, 'value'],
  ['wide', { value: 42 }, 42], ['custom', {}, { count: '42' }], ['floating', {}, null], ['nothing', {}, null],
];
assert.equal(process.platform, 'darwin', 'This gate uses the documented macOS/Xcode/Android NDK acceptance environment.');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let adapter;
try {
  const producer = path.join(work, 'ordinary producer');
  cpSync(path.join(here, '../fixtures/standard-tauri'), producer, { recursive: true });
  cpSync(path.join(here, '../fixtures/typed-tauri'), producer, { recursive: true });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  run('npm', ['run', 'build'], { cwd: producer });
  const before = snapshot(producer);
  run('git', ['init', '--quiet'], { cwd: producer });
  run('git', ['add', '--', ...Object.keys(before)], { cwd: producer });
  const manifest = path.join(producer, 'src-tauri/Cargo.toml');
  run('cargo', ['check', '--locked', '--offline', '--lib', '--manifest-path', manifest, '--target-dir', path.join(root, 'target')]);
  const model = discoverProject('src-tauri', producer);
  const bindings = generateCommands(model);
  writeFileSync(path.join(evidence, 'commands.ts'), bindings);
  const loaded = await import(pathToFileURL(path.join(evidence, 'commands.ts')).href);
  assert.deepEqual([...new Set(loaded.typeDiagnostics.map(d => d.command))].sort(), ['custom', 'wide']);
  assert.ok(loaded.typeDiagnostics.every(d => d.line > 0 && d.location && d.message));
  // The wrapper preserves the exact request object, cancellation and options.
  let cancelled = false;
  const request = Object.assign(Promise.resolve({ ok: true, value: null }), { cancel() { cancelled = true; } });
  const options = { signal: new AbortController().signal };
  const payload = {};
  const bound = loaded.createCommands((...args) => { assert.deepEqual(args, ['nothing', payload, options]); return request; });
  assert.equal(bound('nothing', payload, options), request);
  request.cancel(); assert.equal(cancelled, true);

  const source = readFileSync(model.source, 'utf8');
  const changed = path.join(work, 'changed.rs');
  writeFileSync(changed, source.replace('floating, nothing]', 'floating, nothing, unregistered]'));
  const changedBindings = generateCommands(nativeTool('inspect', changed));
  assert.notEqual(changedBindings, bindings);
  writeFileSync(changed, source.replace(/tauri::generate_handler!\[[^\]]*\]/, 'tauri::generate_handler![]'));
  const emptyBindings = generateCommands(nativeTool('inspect', changed));

  // Compare the generated native ABI with the real Tauri handler in a separate test copy.
  const requests = path.join(work, 'requests.json');
  writeFileSync(requests, JSON.stringify(samples.map(([command, payload]) => ({ command, payload }))));
  const desktop = path.join(work, 'desktop-parity');
  cpSync(producer, desktop, { recursive: true, filter: file => !['node_modules', '.git'].includes(path.basename(file)) });
  const desktopSource = path.join(desktop, 'src-tauri/src/lib.rs');
  const parity = readFileSync(path.join(here, '../native-export/desktop-parity.rs'), 'utf8').replace(/super::describe,[\s\S]*?super::nothing/, model.commands.map(c => `super::${c.name}`).join(', '));
  writeFileSync(desktopSource, source + '\n' + parity);
  const desktopManifest = path.join(desktop, 'src-tauri/Cargo.toml');
  writeFileSync(desktopManifest, readFileSync(desktopManifest, 'utf8').replace('tauri = { version = "=2.11.5", features = [] }', 'tauri = { version = "=2.11.5", features = ["test"] }'));
  const desktopResult = path.join(work, 'desktop.json');
  run('cargo', ['test', '--locked', '--offline', '--lib', '--manifest-path', desktopManifest, '--target-dir', path.join(root, 'target'), 'export_parity::original_tauri_handler'], { env: { ...process.env, SPIKE_REQUESTS: requests, SPIKE_DESKTOP_RESULT: desktopResult } });
  adapter = prepareAdapter(model);
  run('cargo', ['build', '--locked', '--offline', '--lib', '--manifest-path', adapter.manifest, '--target-dir', path.join(root, 'target')]);
  const python = `import ctypes, json, sys\nlib=ctypes.CDLL(sys.argv[1])\nlib.tauri_native_invoke.argtypes=[ctypes.c_char_p,ctypes.c_char_p]\nlib.tauri_native_invoke.restype=ctypes.c_void_p\nlib.tauri_native_string_free.argtypes=[ctypes.c_void_p]\nresponses=[]\nfor r in json.load(open(sys.argv[2])):\n p=lib.tauri_native_invoke(r['command'].encode(),json.dumps(r['payload']).encode())\n try: value=json.loads(ctypes.string_at(p))\n finally: lib.tauri_native_string_free(p)\n assert value.pop('abiVersion')==2\n responses.append(value)\nprint(json.dumps(responses))\n`;
  const native = JSON.parse(run('python3', ['-c', python, path.join(root, 'target/debug/libordinary_tauri_fixture_lib.dylib'), requests]));
  assert.deepEqual(native, JSON.parse(readFileSync(desktopResult)));
  for (const [i, sample] of samples.entries()) assert.deepEqual(native[i], sample[3] === false ? { ok: false, error: sample[2] } : { ok: true, value: sample[2] });
  adapter.cleanup(); adapter = undefined;

  // Real exports exercise metadata publication and integrity on every mobile slice.
  const artifacts = {};
  for (const platform of ['ios', 'android']) {
    run(process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'export', platform], { cwd: producer });
    const output = path.join(producer, 'src-tauri/gen/tauri-native', platform);
    const manifest = platform === 'ios' ? validateIosArtifacts(output) : validateAndroidArtifacts(output, androidTools());
    assert.equal(readFileSync(path.join(output, 'commands.ts'), 'utf8'), bindings);
    assert.deepEqual(snapshot(producer), before);
    const copied = path.join(evidence, platform);
    rmSync(copied, { recursive: true, force: true }); cpSync(output, copied, { recursive: true });
    artifacts[platform] = JSON.parse(readFileSync(path.join(copied, 'manifest.json')));
  }
  run('git', ['diff', '--exit-code'], { cwd: producer });
  rmSync(producer, { recursive: true, force: true });
  assert.equal(existsSync(producer), false);
  assert.ok(spawnSync('cargo', ['--version'], { env: hostEnv }).error);
  assert.ok(spawnSync('rustc', ['--version'], { env: hostEnv }).error);

  for (const host of ['react-native', 'lynx']) {
    const sdk = path.join(root, 'packages', host);
    const packedText = run('npm', ['pack', '--json', '--pack-destination', work], { cwd: sdk });
    const packed = JSON.parse(packedText.slice(packedText.lastIndexOf('\n[') + 1))[0];
    const consumer = path.join(work, host); mkdirSync(consumer);
    writeFileSync(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
    run('npm', ['install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', path.join(work, packed.filename), ...(host === 'lynx' ? ['@lynx-js/react@0.125.0', '@lynx-js/types@4.1.0'] : [])], { cwd: consumer, env: hostEnv });
    writeFileSync(path.join(consumer, 'consumer.ts'), readFileSync(path.join(here, 'consumer.ts.fixture'), 'utf8').replace('__HOST_PACKAGE__', `@tauri-native/${host}`));
    writeFileSync(path.join(consumer, 'observed.ts'), `import type { Commands } from './Native Artifacts/commands';\n` + native.map((r, i) => `export const sample${i} = ${JSON.stringify(r.ok ? r.value : r.error)} satisfies Commands[${JSON.stringify(samples[i][0])}][${JSON.stringify(r.ok ? 'success' : 'error')}];`).join('\n'));
    writeFileSync(path.join(consumer, 'changed.ts'), changedBindings + '\ncreateCommands(null!)(' + JSON.stringify('unregistered') + ', {});\n');
    writeFileSync(path.join(consumer, 'empty.ts'), emptyBindings);
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, strict: true, exactOptionalPropertyTypes: true, skipLibCheck: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'], jsx: 'react-jsx' }, include: ['*.ts', 'Native Artifacts/commands.ts'] }));
    for (const platform of ['ios', 'android']) {
      const destination = path.join(consumer, 'Native Artifacts');
      rmSync(destination, { recursive: true, force: true }); cpSync(path.join(evidence, platform), destination, { recursive: true });
      run(process.execPath, ['--input-type=commonjs', '-e', `const m=require('@tauri-native/${host}/artifacts').readArtifacts('Native Artifacts','${platform}');if(m.bindings!=='commands.ts')process.exit(1);`], { cwd: consumer, env: hostEnv });
      run(process.execPath, [compiler, '--project', path.join(consumer, 'tsconfig.json')], { cwd: consumer, env: hostEnv });
      console.log(`PASS: ${host}/${platform} copied types, invalid-call diagnostics and actual native JSON`);
    }
  }
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ date: new Date().toISOString(), producerDeleted: true, sourceUnchanged: true, hostWithoutRust: true, packedHosts: ['react-native', 'lynx'], platforms: ['ios', 'android'], nativeParity: native, diagnostics: loaded.typeDiagnostics, artifacts }, null, 2) + '\n');
  console.log(`PASS: command types, actual serde/Tauri parity and isolated packed consumers. Evidence: ${evidence}/report.json`);
} finally {
  adapter?.cleanup(); rmSync(work, { recursive: true, force: true });
}
