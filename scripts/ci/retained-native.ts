import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readRetainedArtifacts } from '../retained-artifacts.ts';
import { validateRetainedNative } from '../retained-validation.ts';
import type { RetainedNativeReceipt } from '../validation-types.ts';
import { digest, json, output, record, root, run } from './common.ts';
import { readRetainedInput, retainedInput, retainedPayload } from './retained-common.ts';

const platform = process.argv[2]; assert(platform === 'ios' || platform === 'android');
const producer = readRetainedInput();
const hosts = json<{ work: string; nativePath: string }>(path.join(output, 'retained-hosts.json'));
const evidence = path.join(output, `retained-native-${platform}`), receiptFile = path.join(output, `retained-${platform}.json`);
rmSync(receiptFile, { force: true }); rmSync(evidence, { recursive: true, force: true }); mkdirSync(evidence);
rmSync(path.join(output, `retained-evidence-${platform}`), { recursive: true, force: true });
const artifacts = path.join(retainedPayload, 'exports', platform);
readRetainedArtifacts(artifacts);
assert.equal(digest(path.join(artifacts, 'manifest.json')), producer.exports[platform].artifactSha256);
const cli = producer.packages.find(item => item.sdk === 'cli')!;
const env: NodeJS.ProcessEnv = { ...process.env, PATH: hosts.nativePath, RETAINED_TEST_OUTPUT: evidence,
  TAURI_NATIVE_CLI_TARBALL: path.join(output, 'input', 'cli', cli.file), TAURI_NATIVE_CLI_SHA256: cli.sha256 };
const device = platform === 'ios' ? env.IOS_SIMULATOR_UDID : env.ANDROID_SERIAL;
assert(device, 'Select the job-owned simulator/emulator');
if (platform === 'android') process.on('exit', code => {
  if (code === 0) return;
  // Keep the original failure even when the emulator itself is unavailable.
  try {
    const result = spawnSync('adb', ['-s', device, 'logcat', '-b', 'all', '-d', '-t', '2000'], { env, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    const directory = path.join(output, 'logs'); mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'retained-android-failure-logcat.log'), `${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error ?? ''}`);
  } catch (error) { console.error(`Could not preserve Android failure diagnostics: ${error}`); }
});
const gates: RetainedNativeReceipt['gates'] = [];
function gate(name: string, args: string[], directory: string, extra: NodeJS.ProcessEnv = {}) {
  const reportFile = path.join(directory, 'report.json'); rmSync(reportFile, { force: true });
  try { run(`retained-${platform}-${name}`, process.execPath, args, root, { ...env, ...extra }); }
  finally {
    const saved = path.join(output, `retained-evidence-${platform}`, name); mkdirSync(saved, { recursive: true });
    if (existsSync(directory)) for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (file.isFile() && /\.(json|log|xml|yaml)$/.test(file.name)) cpSync(path.join(directory, file.name), path.join(saved, file.name));
      if (file.isDirectory() && file.name.endsWith('-maestro')) cpSync(path.join(directory, file.name), path.join(saved, file.name), { recursive: true });
    }
  }
  const files = readdirSync(directory);
  const flows = files.filter(file => file.endsWith('.xml')).sort().map(file => {
    const xml = readFileSync(path.join(directory, file), 'utf8');
    // Maestro 2.4's JUnit output uses explicit SUCCESS testcase statuses.
    assert.match(xml, /<testsuites>[\s\S]*<\/testsuites>/);
    assert(!/<(?:failure|error|skipped)\b/.test(xml), `${name}/${file} did not pass`);
    const cases = [...xml.matchAll(/<testcase\b[^>]*>/g)];
    assert(cases.length > 0 && cases.every(([tag]) => /status="SUCCESS"/.test(tag)), `${name}/${file} needs successful UI cases`);
    return { name: file.slice(0, -4), sha256: digest(path.join(directory, file)) };
  });
  assert.deepEqual(flows.map(flow => flow.name), files.filter(file => file.endsWith('.yaml')).map(file => file.slice(0, -5)).sort(), 'Every UI flow needs a result');
  gates.push({ name, report: json(reportFile), reportSha256: digest(reportFile), flows });
  // The archived reports/logs above and receipt retain the result. Release only
  // this completed gate's disposable builds before the next native host build.
  rmSync(directory, { recursive: true, force: true });
}
gate('standalone', ['packages/cli/test/runtime/plugins.ts', platform, '--consume'], path.join(evidence, `tauri-mobile-plugins/standalone-${platform}`),
  { RETAINED_STANDALONE_INPUT: path.join(retainedPayload, 'standalone', platform) });
gate('native', ['packages/cli/test/runtime/portable.ts', platform, '--release', '--consume'], path.join(evidence, platform === 'ios' ? 'retained-ios-portability' : 'retained-portability'),
  { RETAINED_ARTIFACTS: artifacts });
for (const name of ['react-native', 'expo', 'lynx'] as const) {
  const sdk = name === 'lynx' ? 'lynx' : 'react-native', packed = producer.packages.find(item => item.sdk === sdk)!;
  const sdkEnv = { RETAINED_DEPENDENCIES: path.join(hosts.work, sdk), TAURI_NATIVE_SDK_TARBALL: path.join(output, 'input', sdk, packed.file), TAURI_NATIVE_SDK_SHA256: packed.sha256 };
  gate(name, [`packages/${sdk}/test/retained-${platform}.ts`, artifacts, ...(name === 'expo' ? ['--cng'] : [])],
    path.join(evidence, name === 'expo' ? `react-retained-expo-${platform}-cng` : `${sdk === 'lynx' ? 'lynx' : 'react'}-retained-${platform}`), sdkEnv);
  if (platform === 'android') {
    const renderer = name === 'expo' ? 'expo' : sdk === 'lynx' ? 'lynx' : 'react';
    for (const cng of name === 'expo' ? [false, true] : [false]) {
      for (const mode of ['recreation', 'fresh-permission', 'pending-permission', ...(name !== 'lynx' ? ['rn-permission'] : []), ...(name === 'expo' ? ['expo-permission'] : [])]) {
        gate(`${renderer}-${cng ? 'cng-' : ''}${mode}`, ['packages/cli/test/runtime/recreation-android.ts', renderer, artifacts, ...(cng ? ['--cng'] : []), ...(mode === 'recreation' ? [] : [`--${mode}`])],
          path.join(evidence, 'retained-activity-recreation', ...(cng ? ['cng'] : []), ...(mode === 'recreation' ? [] : [mode]), renderer), sdkEnv);
      }
    }
  }
}
const receipt: RetainedNativeReceipt = { schemaVersion: 1, passed: true, commit: producer.commit, platform, packages: producer.packages, gates,
  producerReceiptSha256: producer.producerReceiptSha256, retainedProducerSha256: digest(path.join(retainedInput, 'retained-producer.json')) };
validateRetainedNative(receipt, platform, producer, receipt.retainedProducerSha256);
readRetainedInput(); readRetainedArtifacts(artifacts);
record(receiptFile, receipt);
console.log(`PASS: original Tauri, native retained clients, RN, Expo, Lynx and required ${platform} lifecycle gates.`);
