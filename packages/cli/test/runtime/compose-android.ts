import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { snapshot } from '../native-export/source-integrity.ts';

const framework = process.argv[2] ?? 'lynx';
assert(framework === 'lynx' || framework === 'react-native', 'Select lynx or react-native');
const device = process.env.ANDROID_SERIAL;
assert(device, 'Select an ANDROID_SERIAL arm64 emulator');
const root = fileURLToPath(new URL('../../../..', import.meta.url));
const fixture = path.join(root, 'packages/cli/test/fixtures/runtime-tauri');
const sources = fileURLToPath(new URL('./composition/', import.meta.url));
const evidence = path.join(root, `target/tauri-mobile-composition/${framework}-android`);
const producer = path.join(evidence, 'producer');
const renderer = path.join(evidence, 'renderer');
const native = path.join(producer, 'src-tauri/gen/android');
const appId = 'dev.taurinative.runtimeproof';
const env = { ...process.env, CARGO_TARGET_DIR: path.join(root, 'target'), NODE_OPTIONS: '', PROOF_REPOSITORY: root,
  RUSTFLAGS: '-C link-arg=-landroid -C link-arg=-llog -C link-arg=-lOpenSLES -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384',
};
const original = snapshot(fixture);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });

function run(label: string, command: string, args: string[], cwd = producer) {
  console.log(`> ${framework}-android: ${label}`);
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function report(name: string) {
  const result = spawnSync('adb', ['-s', device!, 'exec-out', 'run-as', appId, 'cat', name], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

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
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
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
    run('renderer-build', 'node', ['build.cjs', 'android'], renderer);
    bundle = path.join(renderer, 'index.bundle.js');
  }
  run('producer-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']);
  const before = snapshot(producer);
  run('native-init', 'npm', ['run', 'tauri', '--', 'android', 'init', '--ci', '--skip-targets-install']);
  const java = path.join(native, 'app/src/main/java/dev/taurinative/runtimeproof');
  for (const file of ['RuntimeProof.java', framework === 'lynx' ? 'LynxProofModule.java' : 'ReactProofPackage.java']) cpSync(path.join(sources, 'android', file), path.join(java, file));
  cpSync(path.join(sources, `android/${framework === 'lynx' ? 'Lynx' : 'React'}Activity.kt.fixture`), path.join(java, 'MainActivity.kt'));
  const assets = path.join(native, 'app/src/main/assets'); mkdirSync(assets, { recursive: true });
  cpSync(bundle, path.join(assets, path.basename(bundle)));
  cpSync(path.join(sources, 'probe.js.fixture'), path.join(assets, 'composition-probe.js'));
  const gradle = path.join(native, 'app/build.gradle.kts');
  const dependencies = framework === 'lynx'
    ? ['org.lynxsdk.lynx:lynx:4.0.1', 'org.lynxsdk.lynx:lynx-jssdk:4.0.1', 'org.lynxsdk.lynx:lynx-trace:4.0.1', 'org.lynxsdk.lynx:primjs:4.0.0']
    : ['com.facebook.react:react-android:0.86.3', 'com.facebook.hermes:hermes-android:250829098.0.17'];
  writeFileSync(gradle, readFileSync(gradle, 'utf8') + `\ndependencies {\n${dependencies.map(dependency => `  implementation("${dependency}")`).join('\n')}\n}\n`);
  if (framework === 'react-native') {
    const jni = path.join(native, 'app/src/main/jni'); mkdirSync(jni, { recursive: true });
    cpSync(path.join(sources, 'android/ReactOnLoad.cpp'), path.join(jni, 'ReactOnLoad.cpp'));
    cpSync(path.join(sources, 'android/ReactCMakeLists.txt'), path.join(jni, 'CMakeLists.txt'));
    writeFileSync(gradle, readFileSync(gradle, 'utf8') + `\nandroid {\n  ndkVersion = "27.1.12297006"\n  buildFeatures { prefab = true }\n  buildTypes.getByName("debug") { isJniDebuggable = false; packaging.jniLibs.keepDebugSymbols.clear() }\n  defaultConfig { externalNativeBuild { cmake { arguments += "-DANDROID_STL=c++_shared" } } }\n  packaging { jniLibs.pickFirsts += "**/libc++_shared.so" }\n  externalNativeBuild { cmake { path = file("src/main/jni/CMakeLists.txt"); version = "3.22.1" } }\n}\n`);
    const rootGradle = path.join(native, 'build.gradle.kts');
    writeFileSync(rootGradle, readFileSync(rootGradle, 'utf8').replace('1.9.25', '2.1.20'));
  }
  // Tauri 2.11.5 codegen does not track a changed Android output directory in its build cache.
  run('refresh-tauri-codegen', 'cargo', ['clean', '--package', 'tauri', '--target', 'aarch64-linux-android', '--manifest-path', 'src-tauri/Cargo.toml']);
  run('native-build', 'npm', ['run', 'tauri', '--', 'android', 'build', '--ci', '--debug', '--target', 'aarch64', '--apk']);
  assert.deepEqual(snapshot(producer), before, 'Composition changes only generated platform integration');
  const apk = path.join(native, 'app/build/outputs/apk/universal/debug/app-universal-debug.apk');
  const libraries = run('apk-libraries', 'unzip', ['-Z1', apk]).split('\n').filter(file => file.startsWith('lib/') && file.endsWith('.so'));
  assert(libraries.length > 0);
  const elfDirectory = path.join(evidence, 'elf-check'); mkdirSync(elfDirectory, { recursive: true });
  for (const library of libraries) {
    run(`extract-${path.basename(library)}`, 'unzip', ['-o', apk, library, '-d', elfDirectory]);
    const file = path.join(elfDirectory, library);
    const headers = run(`elf-${path.basename(library)}`, path.join(process.env.NDK_HOME!, 'toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf'), ['-lW', file]);
    const loads = headers.split('\n').filter(line => line.trim().startsWith('LOAD '));
    assert(loads.length && loads.every(line => BigInt(line.trim().split(/\s+/).at(-1)!) >= 16384n), `${library} must be 16 KB aligned`);
  }
  run('install-app', 'adb', ['-s', device, 'install', '-r', apk]); installed = true;
  run('clear-proof', 'adb', ['-s', device, 'shell', 'run-as', appId, 'rm', '-f', 'runtime-report.json', 'composition-report.json']);
  run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
  await until(() => report('composition-report.json').completed >= 1);
  assert.equal(report('runtime-report.json').passed, true);
  const initial = report('composition-report.json');
  flow('initial-ui', '- assertVisible: "LYNX SURFACE 1"\n- assertVisible: "Tauri state 45"\n- tapOn: "Verify Tauri"');
  run('background', 'adb', ['-s', device, 'shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  await until(() => report('composition-report.json').stopped >= 1);
  run('resume', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.MainActivity`]);
  flow('remount-ui', '- assertVisible: "LYNX SURFACE 1"\n- tapOn: "Verify Tauri"\n- tapOn: "Remount renderer"\n- assertVisible: "LYNX SURFACE 2"\n- assertVisible: "Tauri state 45"\n- tapOn: "Verify Tauri"');
  await until(() => report('composition-report.json').completed >= 5);
  const result = report('composition-report.json');
  assert.equal(result.pid, initial.pid, 'Background/resume must retain the Tauri process');
  assert.equal(result.generation, 2); assert.equal(result.released, 1);
  assert(result.resumed >= 2 && result.paused >= 1 && result.stopped >= 1);
  assert.deepEqual(result.lastProbe.state, { value: 45, setupCount: 1, pluginSetupCount: 1, appIdentifier: appId });
  assert.equal(result.lastProbe.denied, true); assert.equal(result.lastProbe.pluginCalls, 0);
  assert.equal(result.lastProbe.error, undefined);
  assert.deepEqual(snapshot(producer), before);
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, renderer: framework === 'lynx' ? 'Lynx 4.0.1' : 'React Native 0.86.3', platform: 'android',
    libraries, elfAlignment: 'Every packaged LOAD segment >= 16 KB', sourceHashes: original, producerUnchanged: true, originalFrontendUnchanged: true, result,
    transport: 'Test-only native module proxies through the main real Tauri WebView IPC; production direct dispatch is M7 work',
    baseline: report('runtime-report.json'),
  }, null, 2) + '\n');
  console.log(`PASS: ${framework} and Tauri Android coexistence, real renderer interaction, remount and background/resume. ${evidence}/report.json`);
} finally {
  if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]);
  assert.deepEqual(snapshot(fixture), original, 'Checked-in producer must remain unchanged even on failure');
}
