import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../src/artifacts/files.ts';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const mode = process.argv[2];
assert(mode === 'standalone' || mode === 'react' || mode === 'lynx', 'Select standalone, react or lynx');
const options = process.argv.slice(3);
assert(options.filter(option => !option.startsWith('--')).length <= 1 &&
  options.every(option => !option.startsWith('--') || option === '--fresh-permission'), 'Use [artifact] [--fresh-permission]');
const freshPermission = options.includes('--fresh-permission');
const composed = mode !== 'standalone';
const name = mode === 'react' ? 'RN' : 'Lynx';
const device = process.env.ANDROID_SERIAL; assert(device, 'Select an arm64 ANDROID_SERIAL emulator');
const evidence = path.join(root, 'target/retained-activity-recreation', ...(freshPermission ? ['fresh-permission'] : []), mode);
const producer = path.join(evidence, 'ordinary producer');
const consumer = path.join(evidence, 'source free consumer');
const artifact = path.resolve(options.find(option => !option.startsWith('--')) ?? path.join(root, 'target/retained-portability/exported-runtime'));
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const original = snapshot(fixture);
const appId = 'dev.taurinative.mobilefieldnotes';
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', CARGO_TARGET_DIR: path.join(root, 'target'),
  ...(!composed ? { RUSTFLAGS: '-C link-arg=-landroid -C link-arg=-llog -C link-arg=-lOpenSLES -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384' } : {}) };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let pid = '';
let liveLog: ReturnType<typeof spawn> | undefined;
const lifecycleLog = path.join(evidence, 'recreation.log');
let producerBefore: ReturnType<typeof snapshot> | undefined;
let inputReceipt: ReturnType<typeof readRetainedArtifacts> | undefined;
let packageSha256: string | undefined;
let bundleSha256: string | undefined;

function run(label: string, command: string, args: string[], cwd = evidence, environment = env) {
  console.log(`> recreation-${mode}: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'adb' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}; full output: ${evidence}/${label}.log\n${result.stdout?.slice(-3000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout.trim();
}
function events(): any[] {
  return readFileSync(lifecycleLog, 'utf8').split('\n').filter(line => line.startsWith('{') && line.endsWith('}'))
    .map(line => JSON.parse(line)).filter(row => row.pid === Number(pid));
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (check()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Native Activity recreation did not complete');
    await setTimeout(300);
  }
}
function flow(label: string, steps: string) {
  const yaml = path.join(evidence, `${label}.yaml`);
  writeFileSync(yaml, `appId: ${appId}\n---\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), yaml]);
}
function action(label: string) {
  run(label, 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.RecreationActivity`, '--es', 'tauri.recreation.probe', label]);
}
async function inspect(label: string) {
  action(label); await until(() => events().some(row => row.stage === label));
  return events().find(row => row.stage === label);
}
function addProbe(android: string, activity: string) {
  if (!composed) {
    // Inherit the ordinary scaffold's onCreate (including edge-to-edge setup).
    // Only the disposable generated class is opened for the telemetry subclass.
    const main = path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/MainActivity.kt');
    const source = readFileSync(main, 'utf8'); assert(source.includes('class MainActivity : TauriActivity()'));
    writeFileSync(main, source.replace('class MainActivity : TauriActivity()', 'open class MainActivity : TauriActivity()'));
  }
  const host = mode === 'react' ? 'React' : 'Lynx';
  const layout = composed ? `
  override fun create${host}Container(webView: WebView): android.view.ViewGroup {
    (webView.parent as? android.view.ViewGroup)?.removeView(webView)
    val layout = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL; setPadding(0, 80, 0, 60) }
    layout.addView(webView, android.widget.LinearLayout.LayoutParams(-1, 0, 1f))
    val container = android.widget.FrameLayout(this)
    layout.addView(container, android.widget.LinearLayout.LayoutParams(-1, 0, 2f))
    setContentView(layout)
    return container
  }
  override fun on${host}HostAttached() { super.on${host}HostAttached(); record("attached") }
` : '';
  const probe = readFileSync(new URL('./composition/android/RecreationActivity.kt.fixture', import.meta.url), 'utf8')
    .replace('__BASE_ACTIVITY__', composed ? 'TauriNativeActivity' : 'MainActivity')
    .replace('__RUNTIME_TELEMETRY__', composed ? 'report.put("runtime", dev.taurinative.runtime.RuntimeSession.status())' : '')
    .replace('__HOST_LAYOUT__', layout);
  writeFileSync(path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/RecreationActivity.kt'), probe);
  const file = path.join(android, 'app/src/main/AndroidManifest.xml');
  const text = readFileSync(file, 'utf8'); assert(text.includes(`android:name="${activity}"`));
  writeFileSync(file, text.replace(`android:name="${activity}"`, 'android:name=".RecreationActivity"'));
}

try {
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  let apk: string;
  if (!composed) {
    rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
    run('dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], producer);
    producerBefore = snapshot(producer);
    run('init', 'npm', ['run', 'tauri', '--', 'android', 'init', '--ci', '--skip-targets-install'], producer);
    const android = path.join(producer, 'src-tauri/gen/android');
    addProbe(android, '.MainActivity');
    run('refresh-native-codegen', 'cargo', ['clean', '--package', 'tauri', '--package', 'tauri-plugin-geolocation', '--package', 'tauri-plugin-deep-link', '--target', 'aarch64-linux-android', '--manifest-path', 'src-tauri/Cargo.toml'], producer);
    run('build', 'npm', ['run', 'tauri', '--', 'android', 'build', '--ci', '--debug', '--target', 'aarch64', '--apk'], producer);
    assert.deepEqual(snapshot(producer), producerBefore);
    const output = path.join(android, 'app/build/outputs/apk');
    const apks = readdirSync(output, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('-debug.apk'));
    assert.equal(apks.length, 1); apk = path.join(output, apks[0]!);
  } else {
    inputReceipt = readRetainedArtifacts(artifact);
    assert(inputReceipt.platform === 'android' && inputReceipt.profile === 'release');
    assert.equal(inputReceipt.bootstrap.applicationId, appId);
    rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
    const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
    const packageName = mode === 'react' ? 'react-native' : 'lynx';
    run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages', packageName));
    const tarball = `tauri-native-${packageName}-1.0.0-rc.0.tgz`;
    packageSha256 = sha256(readFileSync(path.join(consumer, tarball)));
    run('unpack', 'tar', ['-xzf', tarball], consumer);
    const sdk = path.join(consumer, 'package');
    const renderer = path.join(consumer, 'renderer'); mkdirSync(renderer);
    symlinkSync(path.join(root, 'examples', packageName, 'node_modules'), path.join(renderer, 'node_modules'), 'dir');
    writeFileSync(path.join(renderer, 'package.json'), '{"name":"retained-recreation-consumer","private":true,"type":"module"}\n');
    let bundle: string;
    if (mode === 'react') {
      cpSync(path.join(root, 'packages/react-native/test/retained/index.tsx.fixture'), path.join(renderer, 'index.tsx'));
      cpSync(path.join(root, 'packages/react-native/test/retained/build.cjs.fixture'), path.join(renderer, 'build.cjs'));
      writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
      run('renderer-build', process.execPath, ['build.cjs', 'android'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_SDK_DIR: sdk });
      bundle = path.join(renderer, 'index.bundle.js');
    } else {
      mkdirSync(path.join(renderer, 'src'));
      cpSync(path.join(root, 'packages/lynx/test/retained/App.tsx.fixture'), path.join(renderer, 'src/App.tsx'));
      cpSync(new URL('./composition/lynx/index.tsx.fixture', import.meta.url), path.join(renderer, 'src/index.tsx'));
      writeFileSync(path.join(renderer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@lynx-js/react', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
      writeFileSync(path.join(renderer, 'lynx.config.ts'), `import { defineConfig } from '@lynx-js/rspeedy';\nimport { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';\nexport default defineConfig({ plugins: [pluginReactLynx()], source: { alias: { '@tauri-native/lynx/retained': ${JSON.stringify(path.join(sdk, 'src/retained.ts'))} } } });\n`);
      run('renderer-build', path.join(renderer, 'node_modules/.bin/rspeedy'), ['build', '--mode', 'production'], renderer);
      bundle = path.join(renderer, 'dist/main.lynx.bundle');
    }
    bundleSha256 = sha256(readFileSync(bundle));
    const generated = path.join(consumer, 'composed application');
    const android = path.join(generated, 'android');
    const { composeAndroid } = createRequire(import.meta.url)(path.join(sdk, mode === 'react' ? 'compose.js' : 'compose.cjs'));
    const composition = composeAndroid({ artifactsDir: copied, outputDir: generated, bundleFile: bundle,
      ...(mode === 'react' ? { rendererDir: renderer, moduleName: 'RetainedFieldnotes' } : {}) });
    addProbe(android, composition.activity);
    const gradle = path.join(android, 'app/build.gradle.kts');
    writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'));
    run('source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
    apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
    assert(!run('apk-metadata', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk]).includes('application-debuggable'));
  }
  run('apk-alignment', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  run('install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  // Stream before launch: native renderer logs can evict the initial Activity
  // records from Android's ring buffer during a long Maestro flow.
  const logFd = openSync(lifecycleLog, 'w');
  liveLog = spawn('adb', ['-s', device, 'logcat', '-T', '1', '-v', 'raw', '-s', 'TauriRecreation:I', '*:S'], { env, stdio: ['ignore', logFd, logFd] });
  closeSync(logFd);
  run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.RecreationActivity`]);
  pid = run('pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  if (!composed) await until(() => {
    const result = spawnSync('adb', ['-s', device, 'exec-out', 'run-as', appId, 'cat', 'runtime-report.json'], { env, encoding: 'utf8', timeout: 10000 });
    return result.status === 0 && JSON.parse(result.stdout).passed === true;
  });
  if (freshPermission) flow('initial-permission', composed
    ? '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"'
    : '- tapOn: "Check location permission"\n- assertVisible: "Location permission prompt"');
  else flow('initial-plugin', composed
    ? `- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "${name} events 0"\n- tapOn: "Request permission"\n- tapOn: "(?i)While using the app"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "${name} note 1"\n- assertVisible: "${name} events 1"`
    : '- tapOn: "Request location permission"\n- tapOn: "(?i)While using the app"\n- assertVisible: "Location permission granted"\n- tapOn: "Save location note"\n- assertVisible: "Saved location note 1"');
  const initial = await inspect('before');
  assert.equal(initial.result.baseline.passed, true);
  assert.equal(initial.result.snapshot.value, 45); assert.equal(initial.result.snapshot.setupCount, 1); assert.equal(initial.result.snapshot.pluginSetupCount, 1);
  assert.equal(initial.result.plugins.notes.length, freshPermission ? 0 : 1);
  assert.equal(initial.result.permission.location, freshPermission ? 'prompt' : 'granted');
  if (composed) assert.equal(initial.runtime.listeners, 1);
  for (let index = 1; index <= 2; index++) {
    const permission = freshPermission ? index === 1 ? 'prompt' : 'prompt-with-rationale' : 'granted';
    action('recreate');
    await until(() => events().filter(row => row.stage === 'create').length === index + 1 && events().filter(row => row.stage === 'webview').length === index + 1);
    flow(`recreated-ui-${index}`, composed
      ? `- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "${name} events 0"\n- tapOn: "Check permission"\n- assertVisible: "Permission ${permission}"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes ${freshPermission ? 0 : 1} setup 1 plugins 1"`
      : `- tapOn: "Check location permission"\n- assertVisible: "Location permission ${permission}"\n- tapOn: "Refresh notes and links"`);
    const after = await inspect(`after-${index}`);
    assert.equal(after.pid, initial.pid); assert.equal(after.wryActivityId, initial.wryActivityId);
    assert.notEqual(after.result.timeOrigin, initial.result.timeOrigin);
    assert.deepEqual(after.result.snapshot, initial.result.snapshot);
    assert.deepEqual(after.result.plugins.notes, initial.result.plugins.notes);
    assert.equal(after.result.permission.location, permission);
    if (composed) assert.equal(after.runtime.listeners, 1);
    // The original fixture's startup self-test assumes State 40 for a fresh JS
    // document. Recreation keeps State 45; verify that state directly above.
    assert.deepEqual(after.result.baseline, { passed: false, error: 'Error: Setup initializes the state' });
    if (freshPermission) {
      const granted = index === 2;
      const expected = granted ? 'granted' : 'prompt-with-rationale';
      flow(`permission-${granted ? 'grant' : 'deny'}`, `- tapOn: "${composed ? 'Request permission' : 'Request location permission'}"\n- tapOn: "${granted ? '(?i)While using the app' : '(?i)Don.t allow'}"\n- assertVisible: "${composed ? 'Permission' : 'Location permission'} ${expected}"`);
      const result = await inspect(`permission-result-${index}`);
      assert.equal(result.result.permission.location, expected);
      assert.equal(result.result.plugins.notes.length, 0);
      assert.deepEqual(result.result.snapshot, initial.result.snapshot);
      assert.equal(result.instance, after.instance);
    }
  }
  const noteCount = freshPermission ? 1 : 2;
  flow('post-recreation-save', composed ? `- tapOn: "Save location"\n- assertVisible: "${name} note ${noteCount}"\n- assertVisible: "${name} events 1"`
    : `- tapOn: "Save location note"\n- assertVisible: "Saved location note ${noteCount}"`);
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/2', '-p', appId]);
  flow('post-recreation-link', composed ? `- assertVisible: "${name} events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes ${noteCount} setup 1 plugins 1"`
    : '- assertVisible: "Links received 1"\n- tapOn: "Refresh notes and links"');
  const final = await inspect('final');
  assert.equal(final.result.plugins.notes.length, noteCount); assert.deepEqual(final.result.plugins.links, ['tauri-fieldnotes://notes/2']);
  for (const note of final.result.plugins.notes) {
    assert.equal(note.text, composed ? `A ${name} place to remember` : 'A place to remember');
    assert(Math.abs(note.latitude - 37.5665) < 0.01 && Math.abs(note.longitude - 126.978) < 0.01);
  }
  const observed = events();
  const created = observed.filter(row => row.stage === 'create');
  assert.equal(new Set(created.map(row => row.instance)).size, 3);
  assert.equal(new Set(observed.filter(row => row.stage === 'webview').map(row => row.webView)).size, 3);
  const closed = observed.filter(row => row.stage === 'destroy-after' && row.changingConfigurations);
  assert.equal(closed.length, 2);
  assert(created.slice(1).every(row => row.result.savedState && row.result.savedWryId === initial.wryActivityId));
  if (composed) {
    assert.equal(observed.filter(row => row.stage === 'attached').length, 3);
    assert(closed.every(row => row.runtime.listeners === 0 && row.runtime.status === 'ready'));
    assert.deepEqual(readRetainedArtifacts(path.join(consumer, 'copied runtime')), inputReceipt);
    assert.deepEqual(readRetainedArtifacts(artifact), inputReceipt);
  }
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, mode, profile: composed ? 'release' : 'debug',
    testSigning: 'Debug test key; composed Release/R8 remains non-debuggable', apkSha256: sha256(readFileSync(apk)),
    ...(composed ? { artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))), packageSha256, bundleSha256, sourceFreeBuild: 'PATH=/usr/bin:/bin:/usr/sbin:/sbin', artifactUnchanged: true }
      : { sourceHashes: producerBefore, producerUnchanged: true }),
    baseline: initial.result.baseline, freshPermission, recreations: 2, nativeUiFlows: freshPermission ? 7 : 5, events: observed,
    limits: `${freshPermission ? 'First permission request after recreation is denied through OS UI; a second recreation preserves the rationale state, and a later OS grant allows location save.' : 'Location permission granted before recreation; fresh permission dialogs are a separate gate.'} Pending OS callbacks and process death are separate gates. The original fixture startup self-test expects initial State 40; the recreated document keeps State 45, verified directly through original IPC.`,
  }, null, 2) + '\n');
} catch (error) {
  if (pid) {
    try {
      writeFileSync(path.join(evidence, 'failure-snapshot.json'), JSON.stringify(await inspect('failure'), null, 2) + '\n');
    } catch (diagnostic) {
      writeFileSync(path.join(evidence, 'failure-snapshot-error.log'), String(diagnostic));
    }
  }
  throw error;
} finally {
  try {
    if (pid) {
      const result = spawnSync('adb', ['-s', device, 'logcat', '-d', '--pid', pid], { env, encoding: 'utf8', timeout: 10000 });
      writeFileSync(path.join(evidence, 'native.log'), result.stdout ?? '');
      writeFileSync(path.join(evidence, 'events.json'), JSON.stringify(events(), null, 2) + '\n');
    }
    if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]);
  } finally {
    if (liveLog && liveLog.exitCode === null && liveLog.signalCode === null) {
      liveLog.kill(); await new Promise(resolve => liveLog!.once('exit', resolve));
    }
    release();
  }
  assert.deepEqual(snapshot(fixture), original);
  if (producerBefore && existsSync(producer)) assert.deepEqual(snapshot(producer), producerBefore);
}
