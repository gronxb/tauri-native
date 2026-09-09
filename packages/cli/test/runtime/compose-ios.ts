import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { snapshot } from '../native-export/source-integrity.ts';
import { prepareRetainedComposition, retainedIosController, mobileCallerPolicy } from './retained-composition.ts';
import { acquireMobileTest } from './mobile-lock.ts';

const framework = process.argv[2] ?? 'lynx';
const retained = process.argv[3] === 'retained';
assert(process.argv[3] === undefined || retained, 'Select retained or omit the runtime argument');
assert(framework === 'lynx' || framework === 'react-native', 'Select lynx or react-native');
const device = process.env.IOS_SIMULATOR_UDID;
assert(device, 'Select an IOS_SIMULATOR_UDID arm64 simulator');
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = path.join(root, 'packages/cli/test/fixtures/runtime-tauri');
const sources = fileURLToPath(new URL('./composition/', import.meta.url));
const evidence = path.join(root, `target/${retained ? 'retained-composition' : 'tauri-mobile-composition'}/${framework}-ios`);
let producer = path.join(evidence, 'producer');
let ordinary: { directory: string; hashes: ReturnType<typeof snapshot> } | undefined;
const renderer = path.join(evidence, 'renderer');
let native = path.join(producer, 'src-tauri/gen/apple');
const appId = 'dev.taurinative.runtimeproof';
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target'), NODE_OPTIONS: '', PROOF_REPOSITORY: root };
let dataDirectory: string;
const original = snapshot(fixture);
const releaseMobileTest = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });

function run(label: string, command: string, args: string[], cwd = producer) {
  console.log(`> ${framework}-ios: ${label}`);
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'xcrun' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function report(name: string) { return JSON.parse(readFileSync(path.join(dataDirectory, name), 'utf8')); }

async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Native composition did not reach its required state');
    await setTimeout(300);
  }
}

function flow(label: string, steps: string) {
  const yaml = path.join(evidence, `${label}.yaml`);
  writeFileSync(yaml, `appId: ${appId}\n---\n${steps.replaceAll('LYNX', framework === 'lynx' ? 'LYNX' : 'RN')}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), yaml]);
}

let installed = false;
try {
  rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
  rmSync(renderer, { recursive: true, force: true }); mkdirSync(path.join(renderer, 'src'), { recursive: true });
  symlinkSync(path.join(root, 'examples', framework, 'node_modules'), path.join(renderer, 'node_modules'), 'dir');
  writeFileSync(path.join(renderer, 'package.json'), '{"name":"runtime-renderer-proof","private":true}\n');
  let bundle: string;
  if (framework === 'lynx') {
    for (const file of ['index.tsx', 'App.tsx']) cpSync(path.join(sources, 'lynx', `${file}.fixture`), path.join(renderer, 'src', file));
    cpSync(path.join(sources, 'lynx/lynx.config.ts.fixture'), path.join(renderer, 'lynx.config.ts'));
    writeFileSync(path.join(renderer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@lynx-js/react', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
    run('renderer-build', path.join(renderer, 'node_modules/.bin/rspeedy'), ['build', '--mode', 'production'], renderer);
    bundle = path.join(renderer, 'dist/main.lynx.bundle');
  } else {
    for (const file of ['index.tsx', 'build.cjs']) cpSync(path.join(sources, 'react-native', `${file}.fixture`), path.join(renderer, file));
    writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
    run('renderer-build', 'node', ['build.cjs', 'ios'], renderer);
    bundle = path.join(renderer, 'index.bundle.js');
  }
  run('producer-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (retained) {
    ordinary = { directory: producer, hashes: snapshot(producer) };
    const generated = path.join(evidence, 'generated-runtime');
    rmSync(generated, { recursive: true, force: true });
    producer = prepareRetainedComposition(producer, generated);
    native = path.join(producer, 'src-tauri/gen/apple');
  }
  const before = snapshot(producer);
  run('native-init', 'npm', ['run', 'tauri', '--', 'ios', 'init', '--ci', '--skip-targets-install']);
  const integration = path.join(native, 'Sources/ordinary-tauri-runtime-fixture');
  const controller = framework === 'lynx' ? 'LynxProof' : 'ReactProof';
  for (const file of [`${controller}.h`, `${controller}.${framework === 'lynx' ? 'm' : 'mm'}`]) cpSync(path.join(sources, 'ios', file), path.join(integration, file));
  if (retained) {
    const runtime = path.join(evidence, 'generated-runtime/runtime');
    for (const file of ['TNRuntimeSession.h', 'TNRuntimeSession.mm']) cpSync(path.join(runtime, 'ios', file), path.join(integration, file));
    cpSync(path.join(runtime, 'tauri_native_runtime.h'), path.join(integration, 'tauri_native_runtime.h'));
    const file = path.join(integration, `${controller}.${framework === 'lynx' ? 'm' : 'mm'}`);
    writeFileSync(file, retainedIosController(readFileSync(file, 'utf8'), framework));
  }
  const main = path.join(integration, 'main.mm');
  const originalMain = readFileSync(main, 'utf8');
  assert(originalMain.includes('ffi::start_app();'));
  writeFileSync(main, `#import "${controller}.h"\n` + originalMain.replace('ffi::start_app();', `@autoreleasepool { [${controller} install]; }\n\tffi::start_app();`));
  const assets = path.join(native, 'assets'); mkdirSync(assets, { recursive: true });
  cpSync(bundle, path.join(assets, path.basename(bundle)));
  if (!retained) cpSync(path.join(sources, 'probe.js.fixture'), path.join(assets, 'composition-probe.js'));
  if (framework === 'lynx') writeFileSync(path.join(native, 'Podfile'), `source 'https://cdn.cocoapods.org/'
platform :ios, '14.0'
use_modular_headers!
target 'ordinary-tauri-runtime-fixture_iOS' do
  pod 'Lynx', '4.0.1', :subspecs => ['Framework']
  pod 'PrimJS', '4.0.0', :subspecs => ['quickjs', 'napi']
end
`);
  else {
    const project = path.join(native, 'project.yml');
    writeFileSync(project, readFileSync(project, 'utf8').replace('iOS: 14.0', 'iOS: 16.4'));
    writeFileSync(path.join(native, 'Podfile'), `ENV['RCT_USE_RN_DEP'] = '1'
ENV['RCT_USE_PREBUILT_RNCORE'] = '1'
require File.join(ENV.fetch('PROOF_REPOSITORY'), 'examples/react-native/node_modules/react-native/scripts/react_native_pods')
platform :ios, '16.4'
prepare_react_native_project!
rn = File.join(ENV.fetch('PROOF_REPOSITORY'), 'examples/react-native/node_modules/react-native')
target 'ordinary-tauri-runtime-fixture_iOS' do
  use_react_native!(:path => rn, :app_path => '${renderer}')
  post_install do |installer|
    react_native_post_install(installer, rn, :mac_catalyst_enabled => false)
  end
end
`);
  }
  run('xcode-project', 'xcodegen', ['generate'], native);
  run('pods', 'pod', ['install'], native);
  run('native-build', 'npm', ['run', 'tauri', '--', 'ios', 'build', '--ci', '--debug', '--target', 'aarch64-sim', '--no-sign']);
  assert.deepEqual(snapshot(producer), before, 'Composition changes only generated platform integration');
  run('install-app', 'xcrun', ['simctl', 'install', device, path.join(native, 'build/arm64-sim/Tauri Runtime Proof.app')]); installed = true;
  const container = run('container', 'xcrun', ['simctl', 'get_app_container', device, appId, 'data']);
  dataDirectory = path.join(container, 'Library/Application Support', appId);
  for (const file of ['runtime-report.json', 'composition-report.json']) rmSync(path.join(dataDirectory, file), { force: true });
  run('launch', 'xcrun', ['simctl', 'launch', device, appId]);
  await until(() => report('composition-report.json').completed >= 1);
  assert.equal(report('runtime-report.json').passed, true);
  const initial = report('composition-report.json');
  flow('initial-ui', '- assertVisible: "LYNX SURFACE 1"\n- assertVisible: "Tauri state 45"\n- tapOn: "Verify Tauri"');
  flow('background', '- pressKey: Home');
  await until(() => report('composition-report.json').stopped >= 1);
  run('resume', 'xcrun', ['simctl', 'launch', device, appId]);
  flow('remount-ui', '- assertVisible: "LYNX SURFACE 1"\n- tapOn: "Verify Tauri"\n- tapOn: "Remount renderer"\n- assertVisible: "LYNX SURFACE 2"\n- assertVisible: "Tauri state 45"\n- tapOn: "Verify Tauri"');
  await until(() => report('composition-report.json').completed >= 5);
  const result = report('composition-report.json');
  assert.equal(result.pid, initial.pid, 'Background/resume must retain the Tauri process');
  assert.equal(result.generation, 2); assert.equal(result.released, 1);
  assert(result.resumed >= 2 && result.paused >= 1 && result.stopped >= 1);
  assert.deepEqual(result.lastProbe.state, { value: 45, setupCount: 1, pluginSetupCount: 1, appIdentifier: appId });
  assert.equal(result.lastProbe.denied, true); assert.equal(result.lastProbe.pluginCalls, 0);
  if (retained) assert.equal(result.lastProbe.callerDenied, true);
  assert.equal(result.lastProbe.error, undefined);
  assert.deepEqual(snapshot(producer), before);
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, renderer: framework === 'lynx' ? 'Lynx 4.0.1' : 'React Native 0.86.3', platform: 'ios',
    sourceHashes: original, producerUnchanged: true, originalFrontendUnchanged: true, result,
    transport: retained ? 'Package-owned ABI 3 native session calls actual Tauri Rust on_message with explicit native policy and original capabilities' : 'Test-only native module proxies through the main real Tauri WebView IPC; production direct dispatch is M7 work',
    ...(retained ? { nativePolicy: mobileCallerPolicy } : {}),
    baseline: report('runtime-report.json'),
  }, null, 2) + '\n');
  console.log(`PASS: ${framework} and Tauri iOS coexistence, real renderer interaction, remount and background/resume. ${evidence}/report.json`);
} finally {
  if (installed) run('uninstall', 'xcrun', ['simctl', 'uninstall', device, appId]);
  if (ordinary) assert.deepEqual(snapshot(ordinary.directory), ordinary.hashes, 'Generated retained integration preserves the independently runnable producer');
  assert.deepEqual(snapshot(fixture), original, 'Checked-in producer must remain unchanged even on failure');
  releaseMobileTest();
}
