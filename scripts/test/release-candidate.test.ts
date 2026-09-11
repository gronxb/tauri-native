import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { readReleaseCandidate, requiredChecks, validateNativeReceipt } from '../release-candidate.ts';

test('the release script keeps a packed prerelease on its experimental npm channel', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tauri-native-publish-channel-'));
  try {
    const pkg = { name: '@tauri-native/cli', version: '1.0.0-rc.0', publishConfig: {
      tag: 'experimental', access: 'public', registry: 'https://registry.npmjs.org/',
    } };
    for (const directory of ['scripts', 'packages/cli', 'package', 'bin', 'candidate']) mkdirSync(path.join(root, directory), { recursive: true });
    for (const directory of ['packages/cli', 'package']) writeFileSync(path.join(root, directory, 'package.json'), JSON.stringify(pkg));
    for (const file of ['release.ts', 'release-candidate.ts']) cpSync(new URL(`../${file}`, import.meta.url), path.join(root, 'scripts', file));
    const file = 'cli.tgz', tarball = path.join(root, 'candidate', file);
    assert.equal(spawnSync('tar', ['-czf', tarball, '-C', root, 'package']).status, 0);
    const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
    const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    assert.equal(git.status, 0);
    writeFileSync(path.join(root, 'candidate/candidate.json'), JSON.stringify({ schemaVersion: 1,
      commit: git.stdout.trim(), passed: true, checks: Object.fromEntries(requiredChecks.map(check => [check, 'success'])),
      packages: [{ name: pkg.name, version: pkg.version, file, sha256 }],
    }));
    // Exercise real npm with a mandatory dry-run wrapper. Registry discovery is
    // isolated, and no publish request or credentials are needed for this test.
    const npm = realpathSync(process.env.PATH!.split(path.delimiter).map(directory => path.join(directory, 'npm')).find(file => existsSync(file))!);
    writeFileSync(path.join(root, 'bin/npm'), `#!${process.execPath}
const { spawnSync } = require('node:child_process');
const result = spawnSync(${JSON.stringify(npm)}, [...process.argv.slice(2), '--dry-run'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
`, { mode: 0o755 });
    const offline = path.join(root, 'registry.mjs');
    writeFileSync(offline, 'globalThis.fetch = async () => ({ ok: false, status: 404 });\n');
    const result = spawnSync(process.execPath, ['--import', offline, path.join(root, 'scripts/release.ts')], {
      encoding: 'utf8', env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
        TAURI_NATIVE_RELEASE_CANDIDATE: path.join(root, 'candidate'), CHANGESETS_OUTPUT: path.join(root, 'events.ndjson') },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /with tag experimental and public access \(dry-run\)/);
    assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), sha256);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'events.ndjson'), 'utf8')), {
      type: 'git-tag', tag: `${pkg.name}@${pkg.version}`, packageName: pkg.name,
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication rejects failed validation, stale commits and changed packed bytes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tauri-native-release-candidate-'));
  try {
    const pkg = { name: '@tauri-native/cli', version: '1.0.0-rc.0', publishConfig: { tag: 'experimental' } };
    mkdirSync(path.join(root, 'package'));
    writeFileSync(path.join(root, 'package/package.json'), JSON.stringify(pkg));
    const file = 'cli.tgz';
    assert.equal(spawnSync('tar', ['-czf', path.join(root, file), '-C', root, 'package']).status, 0);
    const packed = readFileSync(path.join(root, file));
    const commit = '1'.repeat(40);
    const candidate = { schemaVersion: 1, commit, passed: true,
      checks: Object.fromEntries(requiredChecks.map(check => [check, 'success'])),
      packages: [{ name: pkg.name, version: pkg.version, file, sha256: createHash('sha256').update(packed).digest('hex') }],
    };
    const save = (value: unknown) => writeFileSync(path.join(root, 'candidate.json'), JSON.stringify(value));
    save(candidate);
    assert.equal(readReleaseCandidate(root, commit, [pkg])[0]!.tarball, path.join(root, file));
    assert.throws(() => readReleaseCandidate(root, '2'.repeat(40), [pkg]), /release commit/);
    assert.throws(() => readReleaseCandidate(root, commit, [{ ...pkg, version: '1.0.0' }]), /Packed version/);
    save({ ...candidate, checks: { ...candidate.checks, 'native-ios': 'failure' } });
    assert.throws(() => readReleaseCandidate(root, commit, [pkg]), /native-ios did not pass/);
    for (const check of ['retained-producer', 'retained-ios', 'retained-android']) {
      for (const status of ['failure', 'skipped', 'cancelled']) {
        save({ ...candidate, checks: { ...candidate.checks, [check]: status } });
        assert.throws(() => readReleaseCandidate(root, commit, [pkg]), /did not pass/);
      }
      const checks = { ...candidate.checks }; delete checks[check]; save({ ...candidate, checks });
      assert.throws(() => readReleaseCandidate(root, commit, [pkg]), /Missing required/);
    }
    save({ ...candidate, checks: { producer: 'success' } });
    assert.throws(() => readReleaseCandidate(root, commit, [pkg]), /Missing required/);
    save(candidate);
    writeFileSync(path.join(root, file), Buffer.concat([packed, Buffer.from('changed after validation')]));
    assert.throws(() => readReleaseCandidate(root, commit, [pkg]), /Changed candidate tarball/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a successful job cannot certify missing host coverage or another candidate', () => {
  const producer = { commit: 'a'.repeat(40), packages: [
    { sdk: 'react-native', sha256: 'b'.repeat(64) }, { sdk: 'lynx', sha256: 'c'.repeat(64) },
  ] };
  const report = { schemaVersion: 1, platform: 'ios', commit: producer.commit, passed: true,
    producerReceiptSha256: 'd'.repeat(64), packages: producer.packages,
    checks: ['feature', 'feature-changed', 'async-rn', 'async-lynx', 'view-rn', 'view-lynx'],
    features: [false, true].map(changedRust => ({ changedRust, passed: true,
      results: ['rn', 'expo', 'lynx'].map(host => ({ host, platform: 'ios', passed: true,
        packageSha256: producer.packages[host === 'lynx' ? 1 : 0]!.sha256,
        abandonment: changedRust ? [{ elapsedMs: 4000, injectedSearchDelayMs: 20000 }, { elapsedMs: 5000, injectedSearchDelayMs: 20000 }] : [],
      })),
    })),
  };
  const validate = (value: unknown) => validateNativeReceipt(value, 'ios', producer, report.producerReceiptSha256);
  validate(report);
  assert.throws(() => validate({ ...report, commit: 'e'.repeat(40) }), /different commit/);
  assert.throws(() => validate({ ...report, producerReceiptSha256: 'f'.repeat(64) }), /different inputs/);
  assert.throws(() => validate({ ...report, checks: report.checks.filter(check => check !== 'view-lynx') }), /Incomplete native gates/);
  const incomplete = structuredClone(report);
  incomplete.features[1]!.results = incomplete.features[1]!.results.filter(item => item.host !== 'expo');
  assert.throws(() => validate(incomplete));
  const stalled = structuredClone(report);
  stalled.features[1]!.results[0]!.abandonment[0]!.elapsedMs = 20000;
  assert.throws(() => validate(stalled));
});
