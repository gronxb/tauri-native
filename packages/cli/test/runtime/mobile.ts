import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';

const platform = process.argv[2];
assert(platform === 'ios' || platform === 'android', 'Select ios or android');
const device = platform === 'ios' ? process.env.IOS_SIMULATOR_UDID : process.env.ANDROID_SERIAL;
assert(device, 'Select a booted IOS_SIMULATOR_UDID or ANDROID_SERIAL emulator');
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = path.join(root, 'packages/cli/test/fixtures/runtime-tauri');
const evidence = path.join(root, 'target/tauri-mobile-runtime');
const producer = path.join(evidence, `${platform} producer`);
const appIdentifier = 'dev.taurinative.runtimeproof';
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target') };
const original = snapshot(fixture);
const releaseMobileTest = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, `${platform}-report.json`), { force: true });

function run(label: string, command: string, args: string[]) {
  console.log(`> ${platform}: ${label}`);
  const result = spawnSync(command, args, { cwd: producer, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: ['adb', 'xcrun'].includes(command) ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${platform}-${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function artifact(directory: string, matches: (file: string) => boolean) {
  const files = readdirSync(directory, { recursive: true, encoding: 'utf8' }).map(file => path.join(directory, file)).filter(matches);
  assert.equal(files.length, 1, `Expected one installable ${platform} artifact: ${files}`);
  return files[0]!;
}

let installed = false;
try {
  rmSync(producer, { recursive: true, force: true });
  cpSync(fixture, producer, { recursive: true });
  if (platform === 'android') assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  run('install-dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const before = snapshot(producer);
  run('init', 'npm', ['run', 'tauri', '--', platform, 'init', '--ci', '--skip-targets-install']);
  let readReport: () => string;
  let dataDirectory: string;
  if (platform === 'ios') {
    run('build', 'npm', ['run', 'tauri', '--', 'ios', 'build', '--ci', '--debug', '--target', 'aarch64-sim', '--no-sign']);
    const app = artifact(path.join(producer, 'src-tauri/gen/apple/build'), file => file.endsWith('.app') && path.basename(path.dirname(file)) === 'arm64-sim');
    run('install-app', 'xcrun', ['simctl', 'install', device, app]); installed = true;
    const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appIdentifier, 'data']);
    dataDirectory = path.join(container, 'Library/Application Support', appIdentifier);
    const report = path.join(dataDirectory, 'runtime-report.json');
    rmSync(report, { force: true });
    run('launch', 'xcrun', ['simctl', 'launch', device, appIdentifier]);
    readReport = () => readFileSync(report, 'utf8');
  } else {
    const abi = run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']);
    assert.equal(abi, 'arm64-v8a', 'This baseline currently executes an arm64 Android emulator');
    run('build', 'npm', ['run', 'tauri', '--', 'android', 'build', '--ci', '--debug', '--target', 'aarch64', '--apk']);
    const apk = artifact(path.join(producer, 'src-tauri/gen/android/app/build/outputs/apk'), file => file.endsWith('-debug.apk'));
    run('install-app', 'adb', ['-s', device, 'install', '-r', apk]); installed = true;
    dataDirectory = `/data/user/0/${appIdentifier}`;
    run('clear-report', 'adb', ['-s', device, 'shell', 'run-as', appIdentifier, 'rm', '-f', 'runtime-report.json']);
    run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appIdentifier}/.MainActivity`]);
    readReport = () => {
      const result = spawnSync('adb', ['-s', device, 'exec-out', 'run-as', appIdentifier, 'cat', 'runtime-report.json'], { env, encoding: 'utf8', timeout: 10000 });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout;
    };
  }
  const deadline = Date.now() + 60000;
  let result: { passed: boolean; reloaded: boolean; state: unknown; scenarios: string[]; directory: string };
  for (;;) {
    try { result = JSON.parse(readReport()); break; }
    catch (error) { if (Date.now() >= deadline) throw error; await setTimeout(500); }
  }
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.reloaded, true);
  assert.deepEqual(result.state, { value: 45, setupCount: 1, pluginSetupCount: 1, appIdentifier });
  assert.deepEqual(result.scenarios, ['setup', 'state', 'app-handle', 'async', 'rust-event', 'plugin-setup', 'plugin-allowed', 'plugin-denied', 'domain-error', 'reload']);
  assert.equal(path.resolve(result.directory), dataDirectory, 'Frontend and native app-data paths agree');
  assert.deepEqual(snapshot(producer), before, 'Standard mobile initialization/build preserves authored producer files');
  writeFileSync(path.join(evidence, `${platform}-report.json`), JSON.stringify({ passed: true, platform, device,
    runtime: 'real Tauri 2.11.5 / Wry', build: 'standard Tauri CLI, debug simulator/emulator',
    sourceHashes: original, producerUnchanged: true, result,
    mobileComposition: 'Standalone baseline only; RN/Lynx attachment remains tracked in #41',
  }, null, 2) + '\n');
  console.log(`PASS: standalone Tauri ${platform} runtime. Evidence: ${evidence}/${platform}-report.json`);
} finally {
  if (installed) {
    if (platform === 'ios') run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appIdentifier]);
    else run('uninstall', 'adb', ['-s', device, 'uninstall', appIdentifier]);
  }
  assert.deepEqual(snapshot(fixture), original, 'The checked-in producer remains unchanged even on failure');
  releaseMobileTest();
}
