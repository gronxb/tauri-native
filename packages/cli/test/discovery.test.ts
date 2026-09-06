import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/standard-tauri', import.meta.url));
const corpus = fileURLToPath(new URL('./fixtures/compatibility', import.meta.url));
const cli = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));

function snapshot(root: string): Record<string, string> {
  return Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(root, file), createHash('sha256').update(readFileSync(file)).digest('hex')];
    }));
}

function inspect(producer: string) {
  const result = spawnSync(process.execPath, [cli, 'inspect', '--json'], { cwd: producer, encoding: 'utf8' });
  assert.equal(result.stderr, '', result.stderr);
  return { status: result.status, model: JSON.parse(result.stdout), raw: result.stdout };
}

function inProducer(test: (producer: string) => void) {
  const producer = realpathSync(mkdtempSync(path.join(tmpdir(), 'ordinary Tauri inspection ')));
  try { cpSync(fixture, producer, { recursive: true }); test(producer); }
  finally { rmSync(producer, { recursive: true, force: true }); }
}

describe('ordinary Tauri discovery', () => {
  it('uses Cargo library metadata, accepts a normal semver range, and never builds or edits the producer', () => inProducer(producer => {
    const manifest = path.join(producer, 'src-tauri/Cargo.toml');
    writeFileSync(manifest, readFileSync(manifest, 'utf8')
      .replace('name = "ordinary_tauri_fixture_lib"', 'name = "custom_library"\npath = "domain/commands.rs"')
      .replace('version = "=2.11.5"', 'version = "2"'));
    mkdirSync(path.join(producer, 'src-tauri/domain'));
    renameSync(path.join(producer, 'src-tauri/src/lib.rs'), path.join(producer, 'src-tauri/domain/commands.rs'));
    const before = snapshot(producer);
    const first = inspect(producer);
    assert.equal(first.status, 0, first.raw);
    assert.equal(first.model.libraryName, 'custom_library');
    assert.deepEqual(first.model.commands.map((command: { name: string }) => command.name), ['describe', 'greet', 'select', 'optional', 'nothing']);
    assert.equal(first.model.commands[1].parameters[0].key, 'displayName');
    assert.ok(first.model.commands[1].line > 1);
    assert.equal(inspect(producer).raw, first.raw, 'JSON discovery must be deterministic');
    assert.deepEqual(snapshot(producer), before, 'Inspection must not run frontend hooks, Cargo builds, or mutate source');
  }));

  it('reads workspace members and object build hooks without executing them', () => inProducer(producer => {
    const manifest = path.join(producer, 'src-tauri/Cargo.toml');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('[workspace]', ''));
    writeFileSync(path.join(producer, 'Cargo.toml'), '[workspace]\nmembers = ["src-tauri"]\nresolver = "2"\n');
    renameSync(path.join(producer, 'src-tauri/Cargo.lock'), path.join(producer, 'Cargo.lock'));
    const config = path.join(producer, 'src-tauri/tauri.conf.json');
    const value = JSON.parse(readFileSync(config, 'utf8'));
    value.build.beforeBuildCommand = { script: 'this-command-must-never-run', cwd: 'web app' };
    writeFileSync(config, JSON.stringify(value));
    const before = snapshot(producer);
    const result = inspect(producer);
    assert.equal(result.status, 0, result.raw);
    assert.equal(result.model.workspaceRoot, producer);
    assert.equal(result.model.frontend.build.cwd, path.join(producer, 'web app'));
    assert.deepEqual(snapshot(producer), before);
  }));

  it('returns source diagnostics for every rejected compatibility fixture', () => {
    const cases = JSON.parse(readFileSync(path.join(corpus, 'cases.json'), 'utf8'));
    for (const test of cases.blocked) inProducer(producer => {
      cpSync(path.join(corpus, test.name), producer, { recursive: true });
      const before = snapshot(producer);
      const result = inspect(producer);
      assert.equal(result.status, 1, test.name);
      assert.ok(result.model.diagnostics.some((diagnostic: { message: string }) => diagnostic.message.includes(test.diagnostic)), result.raw);
      assert.ok(result.model.diagnostics[0].line > 0);
      assert.equal(result.model.diagnostics[0].file, path.join(producer, 'src-tauri/src/lib.rs'));
      assert.deepEqual(snapshot(producer), before);
    });
  });

  it('reports multiple unsupported commands and detects runtime use hidden in a helper', () => inProducer(producer => {
    const source = path.join(producer, 'src-tauri/src/lib.rs');
    const original = readFileSync(source, 'utf8');
    writeFileSync(source, original.replace('fn greet(', 'async fn greet(').replace('fn optional(', 'async fn optional('));
    const multiple = inspect(producer);
    assert.equal(multiple.status, 1);
    assert.equal(multiple.model.diagnostics.length, 2);
    writeFileSync(source, original + '\nfn runtime_helper(app: tauri::AppHandle) { println!("{}", app.package_info().name); }\n');
    const helper = inspect(producer);
    assert.equal(helper.status, 1);
    assert.match(helper.model.diagnostics[0].message, /runtime-dependent helper/);
  }));

  it('rejects config overlays before analyzing commands', () => inProducer(producer => {
    writeFileSync(path.join(producer, 'src-tauri/tauri.ios.conf.json'), '{}');
    const before = snapshot(producer);
    const result = inspect(producer);
    assert.equal(result.status, 1);
    assert.match(result.model.diagnostics[0].file, /tauri\.ios\.conf\.json$/);
    assert.deepEqual(snapshot(producer), before);
  }));
});
