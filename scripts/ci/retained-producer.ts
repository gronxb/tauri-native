import assert from 'node:assert/strict';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readRetainedArtifacts } from '../retained-artifacts.ts';
import { validateRetainedProducer } from '../retained-validation.ts';
import type { Platform, RetainedProducerReceipt } from '../validation-types.ts';
import { digest, json, output, readInput, record, root, run } from './common.ts';
import { retainedInput, retainedPayload } from './retained-common.ts';

assert.equal(process.platform, 'darwin'); assert.equal(process.arch, 'arm64');
const input = path.join(output, 'input'), producer = readInput(input);
const cli = producer.packages.find(item => item.sdk === 'cli')!;
for (const directory of [retainedInput, retainedPayload]) {
  rmSync(directory, { recursive: true, force: true }); mkdirSync(directory, { recursive: true });
}
const evidence = path.join(output, 'retained-export');
const env = { ...process.env, TAURI_NATIVE_CLI_TARBALL: path.join(input, cli.sdk, cli.file), TAURI_NATIVE_CLI_SHA256: cli.sha256, RETAINED_TEST_OUTPUT: evidence };
for (const fixture of ['mobile-plugin-tauri', 'runtime-tauri']) {
  run(`retained-fetch-${fixture}`, 'cargo', ['fetch', '--locked', '--manifest-path', `packages/cli/test/fixtures/${fixture}/src-tauri/Cargo.toml`], root, env);
}
run('retained-ordinary-desktop', process.execPath, ['packages/cli/test/runtime/baseline.ts', 'plugins'], root, env);
run('retained-desktop-dispatch', process.execPath, ['packages/cli/test/runtime/retained.ts'], root, env);
const exports = {} as RetainedProducerReceipt['exports'], standalone = {} as RetainedProducerReceipt['standalone'];
for (const platform of ['ios', 'android'] as Platform[]) {
  const targetEnv = { ...env, RETAINED_EXPORT_TARGETS: platform === 'ios' ? 'aarch64-sim' : 'x86_64' };
  run(`retained-ordinary-${platform}-build`, process.execPath, ['packages/cli/test/runtime/plugins.ts', platform, '--build-only'], root, targetEnv);
  const original = path.join(evidence, `tauri-mobile-plugins/standalone-${platform}/prepared`);
  standalone[platform] = json(path.join(original, 'prepared.json'));
  cpSync(original, path.join(retainedPayload, 'standalone', platform), { recursive: true });
  run(`retained-export-${platform}`, process.execPath, ['packages/cli/test/runtime/portable.ts', platform, '--release', '--export-only'], root, targetEnv);
  const exported = path.join(evidence, platform === 'ios' ? 'retained-ios-portability' : 'retained-portability');
  exports[platform] = json(path.join(exported, 'export-report.json'));
  const manifest = readRetainedArtifacts(path.join(exported, 'exported-runtime'));
  assert.equal(manifest.platform, platform);
  assert.deepEqual(manifest.native, exports[platform].native);
  cpSync(path.join(exported, 'exported-runtime'), path.join(retainedPayload, 'exports', platform), { recursive: true });
}
run('retained-source-clean', 'git', ['diff', '--exit-code']);
run('retained-archive', 'tar', ['-czf', path.join(retainedInput, 'retained.tar.gz'), '-C', retainedPayload, '.']);
const receipt: RetainedProducerReceipt = {
  schemaVersion: 1, passed: true, commit: producer.commit, producerReceiptSha256: digest(path.join(input, 'producer.json')),
  packages: producer.packages, archiveSha256: digest(path.join(retainedInput, 'retained.tar.gz')), exports, standalone,
  desktop: {
    ordinary: json(path.join(root, 'target/tauri-mobile-plugins/standalone-desktop/desktop-report.json')),
    retained: json(path.join(root, 'target/retained-runtime/report.json')),
  },
};
validateRetainedProducer(receipt, producer, receipt.producerReceiptSha256);
record(path.join(retainedInput, 'retained-producer.json'), receipt);
console.log('PASS: original mobile apps and retained exports from the transferred candidate; native jobs must execute both.');
