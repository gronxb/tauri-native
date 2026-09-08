import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshot } from './source-integrity.ts';
import { nativeTool, DiscoveryError } from '../../src/discovery/native-tool.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const corpus = path.resolve(here, '../fixtures/compatibility');
const contract = JSON.parse(readFileSync(path.join(corpus, 'cases.json'), 'utf8'));
const fixture = path.resolve(corpus, contract.base);
const target = path.join(root, 'target');
const reportPath = path.join(target, 'export-contract/report.json');
const before = snapshot(corpus);
const baseBefore = snapshot(fixture);
const work = mkdtempSync(path.join(tmpdir(), 'tauri native contract '));

function run(command: string, args: string[], options: Omit<import('node:child_process').SpawnSyncOptions, 'encoding'> = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

mkdirSync(path.dirname(reportPath), { recursive: true });
rmSync(reportPath, { force: true });
try {
  // Includes actual native/WKWebView and desktop-handler parity, successful
  // export, deleting/recreating intermediates and git/hash source checks.
  run(process.execPath, ['--experimental-strip-types', path.join(here, 'spike.ts')], { stdio: 'inherit' });
  const positive = JSON.parse(readFileSync(path.join(target, 'export-spike/report.json'), 'utf8'));
  const blocked = [];
  for (const test of contract.blocked) {
    const producer = path.join(work, test.name);
    cpSync(fixture, producer, { recursive: true });
    cpSync(path.join(corpus, test.name), producer, { recursive: true });
    const hashes = snapshot(producer);
    run('git', ['init', '--quiet'], { cwd: producer });
    run('git', ['add', '.'], { cwd: producer });
    // Check the whole producer, not a string that happens to trip a parser.
    // Export rejection must not be confused with invalid ordinary Tauri code.
    mkdirSync(path.join(producer, 'dist'), { recursive: true });
    cpSync(path.join(fixture, 'index.html'), path.join(producer, 'dist/index.html'));
    run('cargo', ['check', '--lib', '--locked', '--offline', '--manifest-path', path.join(producer, 'src-tauri/Cargo.toml'), '--target-dir', target]);
    const output = path.join(work, `${test.name}-generated.rs`);
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => nativeTool('generate', path.join(producer, 'src-tauri/src/lib.rs'), output), error => {
        assert.ok(error instanceof DiscoveryError);
        assert.ok(error.message.includes(test.diagnostic), error.message);
        return true;
      });
      assert.equal(existsSync(output), false, 'A rejection must not publish a valid-looking artifact.');
      assert.deepEqual(snapshot(producer), hashes, `${test.name} changed source`);
      run('git', ['diff', '--exit-code'], { cwd: producer });
    }
    blocked.push({ ...test, desktopCheck: true, repeatedRejection: true, sourceHashes: hashes });
    console.log(`PASS: ordinary Tauri ${test.name} compiles; export rejects without source changes`);
  }

  // A source directory named gen must not be mistaken for tool output.
  const integrityProbe = path.join(work, 'integrity');
  mkdirSync(path.join(integrityProbe, 'src/gen'), { recursive: true });
  const authored = path.join(integrityProbe, 'src/gen/domain.rs');
  writeFileSync(authored, 'original');
  const original = snapshot(integrityProbe);
  writeFileSync(authored, 'changed');
  assert.notDeepEqual(snapshot(integrityProbe), original);
  rmSync(authored);
  assert.notDeepEqual(snapshot(integrityProbe), original);
  writeFileSync(authored, 'original');
  writeFileSync(path.join(integrityProbe, 'src/added.rs'), 'added');
  assert.notDeepEqual(snapshot(integrityProbe), original);

  assert.deepEqual(snapshot(corpus), before);
  assert.deepEqual(snapshot(fixture), baseBefore);
  writeFileSync(reportPath, JSON.stringify({ contractVersion: contract.contractVersion, positive, blocked, corpusHashes: before }, null, 2) + '\n');
  console.log(`PASS: export compatibility contract v${contract.contractVersion}. Evidence: ${reportPath}`);
} finally {
  try {
    assert.deepEqual(snapshot(corpus), before);
    assert.deepEqual(snapshot(fixture), baseBefore);
  } finally { rmSync(work, { recursive: true, force: true }); }
}
