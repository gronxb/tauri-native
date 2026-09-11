import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { commit, digest, json, output, record, root, run } from './common.ts';

assert.equal(process.platform, 'darwin', 'The supported producer toolchain is macOS/Xcode');
const candidate = path.join(output, 'input');
rmSync(candidate, { recursive: true, force: true });
mkdirSync(candidate, { recursive: true });
for (const manifest of ['Cargo.toml', 'packages/cli/native/Cargo.toml', 'packages/cli/test/fixtures/standard-tauri/src-tauri/Cargo.toml', 'examples/ordinary-tauri-feature/src-tauri/Cargo.toml']) {
  run(`fetch-${manifest.replaceAll('/', '-')}`, 'cargo', ['fetch', '--locked', '--manifest-path', manifest]);
}
run('scripts-typecheck', 'nub', ['run', 'typecheck:scripts']);
run('rust-workspace', 'cargo', ['test', '--workspace', '--locked']);
for (const sdk of ['cli', 'react-native', 'lynx']) {
  for (const check of ['test', 'typecheck']) run(`${sdk}-${check}`, 'nub', ['--cwd', `packages/${sdk}`, 'run', check]);
}
run('release-receipt-tests', process.execPath, ['--test', 'scripts/test/release-candidate.test.ts']);
run('ci-command-tests', process.execPath, ['--test', 'scripts/test/ci-command.test.ts']);
run('retained-input-tests', process.execPath, ['--test', 'scripts/test/retained-inputs.test.ts']);
for (const check of ['test:export:contract', 'test:types', 'test:events', 'test:watch']) {
  run(check.replaceAll(':', '-'), 'nub', ['--cwd', 'packages/cli', 'run', check]);
}
const packages = [];
for (const sdk of ['cli', 'react-native', 'lynx']) {
  const directory = path.join(candidate, sdk);
  mkdirSync(directory);
  run(`build-${sdk}`, 'nub', ['--cwd', `packages/${sdk}`, 'run', 'build']);
  run(`pack-${sdk}`, 'npm', ['pack', '--ignore-scripts', '--pack-destination', directory], path.join(root, 'packages', sdk));
  const files = readdirSync(directory);
  assert.equal(files.length, 1);
  const { name, version } = json<import('../validation-types.ts').PackageManifest>(path.join(root, 'packages', sdk, 'package.json'));
  packages.push({ sdk, name, version, file: files[0]!, sha256: digest(path.join(directory, files[0]!)) });
}
const cli = packages.find(item => item.sdk === 'cli')!;
const env = { ...process.env, TAURI_NATIVE_CLI_TARBALL: path.join(candidate, 'cli', cli.file) };
for (const [label, file, extra] of [
  ['relocation-ios', 'native-export/ios.ts', {}],
  ['relocation-android-build', 'native-export/android.ts', { ANDROID_CONSUMER_BUILD_ONLY: '1' }],
  ['async-export', 'native-export/async.ts', {}],
  ['events-export', 'events/export.ts', {}],
  ['feature-export', 'feature/export.ts', {}],
  ['feature-changed-export', 'feature/export.ts', { FIELDNOTES_CHANGED_RUST: '1' }],
  ['onboarding-uninstall', 'feature/uninstall.ts', {}],
] as [string, string, NodeJS.ProcessEnv][]) run(label, process.execPath, ['--experimental-strip-types', `packages/cli/test/${file}`], root, { ...env, ...extra });
run('source-clean', 'git', ['diff', '--exit-code']);
const paths = ['document-feature', 'document-feature-changed', 'async-protocol', 'view-events']
  .flatMap(name => [`target/${name}/artifacts`, `target/${name}/export-report.json`]);
paths.push('target/export-ios/report.json', 'target/export-android/consumer-prepared.json', 'target/export-android/Independent Host/ArtifactHost.apk');
run('archive-exports', 'tar', ['-czf', path.join(candidate, 'exports.tar.gz'), ...paths]);
record(path.join(candidate, 'producer.json'), {
  schemaVersion: 1, commit: commit(), passed: true, packages,
  exportsSha256: digest(path.join(candidate, 'exports.tar.gz')),
  iosRelocation: json(path.join(root, 'target/export-ios/report.json')),
  androidPreparation: json(path.join(root, 'target/export-android/consumer-prepared.json')),
  toolchain: { node: process.version, rust: run('rust-version', 'rustc', ['--version']).trim(), xcode: run('xcode-version', 'xcodebuild', ['-version']).trim() },
});
console.log(`PASS: source-preserving exports from the candidate CLI. Transfer ${candidate}`);
