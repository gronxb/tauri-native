import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { inventory } from '../../src/artifacts/files.ts';
import { validateIosArtifacts } from '../../src/artifacts/ios.ts';
import { publishArtifacts } from '../../src/artifacts/staging.ts';
import { snapshot } from './source-integrity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const evidence = path.join(root, 'target/export-ios');
const work = mkdtempSync(path.join(tmpdir(), 'tauri native ios '));
const bundleId = `dev.tauri-native.artifact-test.run-${process.pid}`;
const hostEnvironment = { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
let device;
let ownsDevice = false;
function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
function host(args, options = {}) { return run('xcrun', args, { env: hostEnvironment, ...options }); }
assert.equal(process.platform, 'darwin', 'This gate needs macOS, Xcode, an installed iOS simulator runtime and Rust iOS targets.');
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
try {
  const cli = path.join(work, 'cli installation'); mkdirSync(cli);
  const cliTarball = process.env.TAURI_NATIVE_CLI_TARBALL ?? path.join(work, JSON.parse(run('npm', ['pack', path.join(root, 'packages/cli'), '--ignore-scripts', '--json', '--pack-destination', work]))[0].filename);
  writeFileSync(path.join(cli, 'package.json'), '{"private":true}');
  run('npm', ['install', '--prefix', cli, '--ignore-scripts', '--no-audit', '--no-fund', cliTarball]);
  const producer = path.join(work, 'ordinary producer');
  cpSync(path.join(here, '../fixtures/standard-tauri'), producer, { recursive: true });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: producer });
  const before = snapshot(producer);
  run('npm', ['run', 'build'], { cwd: producer });
  const frontend = inventory(path.join(producer, 'dist'));
  const output = path.join(producer, 'src-tauri/gen/tauri-native/ios');
  run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'ios', '--incremental'], { cwd: producer });
  assert.deepEqual(snapshot(producer), before, 'Export must preserve the ordinary producer');
  validateIosArtifacts(output);
  const assetFiles = inventory(path.join(output, 'TauriNativeAssets.bundle')).filter(file => file.path !== 'Info.plist');
  assert.deepEqual(assetFiles, frontend, 'Frontend file bytes must be unchanged');
  assert.equal(readFileSync(path.join(output, 'manifest.json'), 'utf8').includes(work), false);
  const published = inventory(output);
  assert.match(run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'ios', '--incremental'], { cwd: producer }), /reused validated/);
  assert.deepEqual(inventory(output), published);
  const configPath = path.join(producer, 'src-tauri/tauri.conf.json');
  const configBytes = readFileSync(configPath);
  const brokenConfig = JSON.parse(configBytes); brokenConfig.build.beforeBuildCommand = 'node -e "process.exit(23)"';
  writeFileSync(configPath, JSON.stringify(brokenConfig));
  const failedSource = snapshot(producer);
  const failure = spawnSync(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'ios'], { cwd: producer, encoding: 'utf8' });
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.deepEqual(snapshot(producer), failedSource);
  assert.deepEqual(inventory(output), published, 'A real frontend build failure must preserve the prior export');
  writeFileSync(configPath, configBytes);
  for (const damage of ['architecture', 'header']) {
    assert.throws(() => publishArtifacts(output, stage => {
      cpSync(output, stage, { recursive: true });
      const manifest = JSON.parse(readFileSync(path.join(stage, 'manifest.json')));
      const library = path.join(stage, manifest.native.find(slice => slice.variant === 'simulator').path);
      if (damage === 'architecture') {
        run('lipo', [library, '-thin', 'arm64', '-output', library + '.thin']); renameSync(library + '.thin', library);
      } else {
        const header = path.join(path.dirname(library), 'Headers/tauri_native.h');
        writeFileSync(header, readFileSync(header, 'utf8').replace('TAURI_NATIVE_ABI_VERSION 2', 'TAURI_NATIVE_ABI_VERSION 99'));
      }
      // Keep checksums correct so the actual binary/header check must reject it.
      manifest.files = inventory(stage).filter(file => file.path !== 'manifest.json');
      writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    }, validateIosArtifacts), damage === 'architecture' ? /Incorrect binary architectures/ : { code: 'artifact_abi' });
    assert.deepEqual(inventory(output), published);
  }
  assert.deepEqual(snapshot(producer), before);

  const rust = path.join(producer, 'src-tauri/src/lib.rs');
  writeFileSync(rust, readFileSync(rust, 'utf8').replace('Hello, {display_name}!', 'Hello again, {display_name}!'));
  const edited = snapshot(producer);
  run(path.join(cli, 'node_modules/.bin/tauri-native'), ['export', 'ios', '--incremental'], { cwd: producer });
  assert.deepEqual(snapshot(producer), edited, 'Refreshing after an authored Rust edit must preserve the edited producer');

  const relocated = path.join(evidence, 'Independent Host', 'Native Artifacts');
  rmSync(path.dirname(relocated), { recursive: true, force: true });
  cpSync(output, relocated, { recursive: true });
  rmSync(producer, { recursive: true, force: true });
  rmSync(cli, { recursive: true, force: true });
  assert.equal(existsSync(producer), false);
  run('/bin/sh', ['-c', '! command -v cargo && ! command -v rustc'], { env: hostEnvironment });
  validateIosArtifacts(relocated);
  const manifest = JSON.parse(readFileSync(path.join(relocated, 'manifest.json')));
  const library = path.join(relocated, manifest.native.find(slice => slice.variant === 'simulator').path);
  const app = path.join(evidence, 'Independent Host', 'ArtifactHost.app'); mkdirSync(app);
  cpSync(path.join(relocated, manifest.assets), path.join(app, manifest.assets), { recursive: true });
  writeFileSync(path.join(app, 'Info.plist'), JSON.stringify({
    CFBundleIdentifier: bundleId, CFBundleName: 'ArtifactHost', CFBundleExecutable: 'ArtifactHost',
    CFBundlePackageType: 'APPL', CFBundleVersion: '1', CFBundleShortVersionString: '1.0',
    MinimumOSVersion: '13.0', UIDeviceFamily: [1, 2], UILaunchScreen: {},
    UISupportedInterfaceOrientations: ['UIInterfaceOrientationPortrait'],
  }));
  host(['plutil', '-convert', 'xml1', path.join(app, 'Info.plist')]);
  const sdk = host(['--sdk', 'iphonesimulator', '--show-sdk-path']).trim();
  const architecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  // Only host-owned Swift and the relocated XCFramework/bundle are inputs.
  const hostSource = path.join(path.dirname(app), 'IOSHost.swift'); cpSync(path.join(here, 'IOSHost.swift'), hostSource);
  host(['swiftc', '-parse-as-library', '-swift-version', '5', '-sdk', sdk, '-target', `${architecture}-apple-ios13.0-simulator`, '-import-objc-header', path.join(path.dirname(library), 'Headers/tauri_native.h'), hostSource, library, '-o', path.join(app, 'ArtifactHost')]);
  host(['codesign', '--force', '--sign', '-', app]);
  const runtimes = JSON.parse(host(['simctl', 'list', 'runtimes', '--json'])).runtimes;
  const devices = JSON.parse(host(['simctl', 'list', 'devices', '--json'])).devices;
  const selectedRuntime = process.env.IOS_SIMULATOR_UDID ? Object.entries(devices).find(([, entries]) => entries.some(item => item.udid === process.env.IOS_SIMULATOR_UDID))?.[0] : undefined;
  const runtime = runtimes.filter(item => item.isAvailable && item.identifier.includes('iOS') && (!process.env.IOS_SIMULATOR_UDID || item.identifier === selectedRuntime)).at(-1);
  assert.ok(runtime, 'Install an iOS Simulator runtime');
  const type = runtime.supportedDeviceTypes.find(item => item.productFamily === 'iPhone');
  assert.ok(type, 'No iPhone device type for the installed runtime');
  if (process.env.IOS_SIMULATOR_UDID) {
    device = devices[runtime.identifier]?.find(item => item.isAvailable && item.udid === process.env.IOS_SIMULATOR_UDID)?.udid;
    assert.ok(device, 'IOS_SIMULATOR_UDID must select an available simulator on the selected runtime');
  } else device = devices[runtime.identifier]?.find(item => item.isAvailable && item.state === 'Booted')?.udid;
  if (!device) {
    device = host(['simctl', 'create', 'Tauri Native Artifact Test', type.identifier, runtime.identifier]).trim();
    ownsDevice = true;
    host(['simctl', 'boot', device]);
  }
  host(['simctl', 'bootstatus', device, '-b'], { timeout: 180000 });
  host(['simctl', 'install', device, app]);
  host(['simctl', 'launch', device, bundleId]);
  const data = host(['simctl', 'get_app_container', device, bundleId, 'data']).trim();
  const reportFile = path.join(data, 'Documents/report.json');
  const deadline = Date.now() + 50000;
  while (!existsSync(reportFile) && Date.now() < deadline) await setTimeout(500);
  assert.ok(existsSync(reportFile), 'Simulator consumer did not finish');
  const result = JSON.parse(readFileSync(reportFile));
  assert.equal(result.fatal, undefined);
  assert.equal(result.abiVersion, 2);
  assert.equal(result.responses, 11);
  assert.equal(result.responses, result.frees);
  assert.deepEqual(result.direct, [
    { abiVersion: 2, ok: true, value: { displayName: '한글 🦀', total: 10 } },
    { abiVersion: 2, ok: false, error: { kind: 'empty_name', message: 'A name is required' } },
    { abiVersion: 2, ok: true, value: null },
  ]);
  assert.deepEqual(result.frontend, {
    success: { displayName: '한글 🦀', total: 10 }, error: { kind: 'empty_name', message: 'A name is required' },
    camelCase: 'Hello again, Ada!', unregisteredRejected: true, absent: null, explicitNull: null, unit: null,
    selection: { type: 'display-name', data: '한글' },
  });
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({
    ...result, simulator: { runtime: runtime.version, architecture },
    installedCli: true, producerUnchanged: true, producerDeleted: true, relocatedPathWithSpaces: true,
    hostWithoutRust: true, frontendBytesUnchanged: true, validatedArchitectures: manifest.native,
    incrementalReuse: true, refreshedRustObservedInHost: true, failedBuildPreservedOutput: true, missingBinaryArchitectureRejected: true, incompatibleHeaderRejected: true,
    deviceExecution: 'Not performed; device slice compiled and inspected',
  }, null, 2) + '\n');
  console.log(`PASS: installed CLI → copied artifacts → iOS Simulator native + unchanged frontend. Evidence: ${evidence}/report.json`);
} finally {
  if (device) {
    spawnSync('xcrun', ['simctl', 'uninstall', device, bundleId]);
    if (ownsDevice) {
      spawnSync('xcrun', ['simctl', 'shutdown', device]);
      spawnSync('xcrun', ['simctl', 'delete', device]);
    }
  }
  rmSync(work, { recursive: true, force: true });
}
