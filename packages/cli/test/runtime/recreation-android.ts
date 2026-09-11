import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../src/artifacts/files.ts';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';
import { prepareRendererPermissions, rendererPermissionActivity } from './renderer-permission-recreation.ts';
import { configureCng } from '../../../react-native/test/retained/cng-scenarios.ts';
import { prepareRetainedPackage, retainedDependencies, retainedEvidence } from '../../../../scripts/retained-test-inputs.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const mode = process.argv[2];
assert(mode === 'standalone' || mode === 'react' || mode === 'expo' || mode === 'lynx', 'Select standalone, react, expo or lynx');
const expo = mode === 'expo';
const react = mode === 'react' || expo;
const options = process.argv.slice(3);
assert(options.filter(option => !option.startsWith('--')).length <= 1 &&
  options.every(option => !option.startsWith('--') || ['--cng', '--fresh-permission', '--pending-permission', '--rn-permission', '--expo-permission'].includes(option)), 'Use [artifact] [--cng] [--fresh-permission | --pending-permission | --rn-permission | --expo-permission]');
const cng = options.includes('--cng'); assert(!cng || expo, 'CNG requires expo mode');
const freshPermission = options.includes('--fresh-permission');
const rendererOwner = options.includes('--rn-permission') ? 'rn' : options.includes('--expo-permission') ? 'expo' : undefined;
assert(!rendererOwner || (react && (rendererOwner !== 'expo' || expo) && !options.includes('--pending-permission') && !(options.includes('--rn-permission') && options.includes('--expo-permission'))), 'Select one supported renderer permission owner');
const closeRenderer = expo || !!rendererOwner;
const pendingPermission = options.includes('--pending-permission') || !!rendererOwner;
assert(!(freshPermission && pendingPermission), 'Run fresh and pending permission scenarios separately');
const composed = mode !== 'standalone';
assert(!pendingPermission || composed, 'Pending renderer continuation checks require react, expo or lynx');
const initiallyUnpermitted = freshPermission || pendingPermission;
const name = react ? 'RN' : 'Lynx';
const device = process.env.ANDROID_SERIAL; assert(device, 'Select an ANDROID_SERIAL emulator matching the exported slices');
const evidence = path.join(retainedEvidence(root, 'retained-activity-recreation'), ...(cng ? ['cng'] : []), ...(rendererOwner ? [`${rendererOwner}-permission`] : pendingPermission ? ['pending-permission'] : freshPermission ? ['fresh-permission'] : []), mode);
const producer = path.join(evidence, 'ordinary producer');
const consumer = path.join(evidence, 'source free consumer');
const artifact = path.resolve(options.find(option => !option.startsWith('--')) ?? path.join(root, 'target/retained-portability/exported-runtime'));
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const original = snapshot(fixture);
const appId = 'dev.taurinative.mobilefieldnotes';
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '', ...(expo ? { NODE_ENV: 'production' } : {}), CARGO_TARGET_DIR: path.join(root, 'target'),
  ...(!composed ? { RUSTFLAGS: '-C link-arg=-landroid -C link-arg=-llog -C link-arg=-lOpenSLES -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384' } : {}) };
const sourceFreePath = `${expo ? path.dirname(process.execPath) + ':' : ''}/usr/bin:/bin:/usr/sbin:/sbin`;
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
let packageSource: string | undefined;
let bundleSha256: string | undefined;
let cngCompositionSha256: string | undefined;

function run(label: string, command: string, args: string[], cwd = evidence, environment = env) {
  console.log(`> recreation-${mode}: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'adb' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}; full output: ${evidence}/${label}.log\n${result.stdout?.slice(-3000)}\n${result.stderr?.slice(-2000)}`);
  return result.stdout.trim();
}
function observations(): any[] {
  return readFileSync(lifecycleLog, 'utf8').split('\n').filter(line => line.startsWith('{') && line.endsWith('}'))
    .map(line => JSON.parse(line)).filter(row => row.pid === Number(pid));
}
function events(): any[] { return observations().filter(row => row.stage); }
function rendererResults(kind: string): any[] { return observations().filter(row => row.kind === `renderer-${kind}`); }
function permissionResults(): any[] { return observations().filter(row => row.kind === 'permission-result'); }
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
function expoModules(index: number) {
  const scroll = (text: string, direction: string) => `- scrollUntilVisible:\n    element:\n      text: ${JSON.stringify(text)}\n    direction: ${direction}`;
  flow(`expo-modules-${index}`, [
    scroll('Expo native modules', 'DOWN'), '- tapOn: "Expo native modules"',
    scroll(`Expo native active 1 created ${index + 1} destroyed ${index} callbacks ${rendererOwner === 'expo' ? index : 0} activities ${index + 1}`, 'UP'),
    scroll(index === 0 ? 'Expo write file' : 'Expo read file', 'DOWN'),
    `- tapOn: "${index === 0 ? 'Expo write file' : 'Expo read file'}"`,
    scroll(index === 0 ? 'Expo file saved' : 'Expo file preserved', 'UP'),
    '- pressKey: Back', '- assertVisible: "RN links 0 back 1"',
  ].join('\n'));
}
function assertExpo(row: any, index: number) {
  assert.equal(row.expo.applicationCreates, 1);
  assert.equal(row.expo.activityCreates, index + 1);
  assert.equal(row.expo.created, index + 1); assert.equal(row.expo.destroyed, index);
  assert.equal(row.expo.callbacks, rendererOwner === 'expo' ? index : 0, 'Only current Expo-owned camera requests may reach Expo callbacks');
  assert.equal(row.expo.backs, index + 1);
  assert.equal(row.expoApplicationHasHost, true);
}
function action(label: string) {
  run(label, 'adb', ['-s', device!, 'shell', 'am', 'start', '-W', '-n', `${appId}/.RecreationActivity`, '--es', 'tauri.recreation.probe', label]);
}
async function inspect(label: string) {
  action(label); await until(() => events().some(row => row.stage === label));
  return events().find(row => row.stage === label);
}
function addProbe(android: string, activity: string) {
  if (pendingPermission) {
    // Observe the real original callback after it returns. No result, registration
    // or routing is substituted; only this disposable test consumer gets telemetry.
    const manager = path.join(android, 'native-dependencies/tauri-android/src/main/java/app/tauri/plugin/PluginManager.kt');
    const source = readFileSync(manager, 'utf8');
    const callback = '          requestPermissionsCallback!!.onResult(result)';
    assert.equal(source.split(callback).length, 2);
    writeFileSync(manager, source.replace(callback, `${callback}
          android.util.Log.i("TauriRecreation", org.json.JSONObject()
            .put("kind", "permission-result").put("pid", android.os.Process.myPid())
            .put("activity", System.identityHashCode(activity))
            .put("grants", org.json.JSONObject(result)).toString())`));
  }
  if (!composed) {
    // Inherit the ordinary scaffold's onCreate (including edge-to-edge setup).
    // Only the disposable generated class is opened for the telemetry subclass.
    const main = path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/MainActivity.kt');
    const source = readFileSync(main, 'utf8'); assert(source.includes('class MainActivity : TauriActivity()'));
    writeFileSync(main, source.replace('class MainActivity : TauriActivity()', 'open class MainActivity : TauriActivity()'));
  }
  const host = react ? 'React' : 'Lynx';
  const layout = composed ? `
  override fun create${host}Container(webView: WebView): android.view.ViewGroup {
    (webView.parent as? android.view.ViewGroup)?.removeView(webView)
    val layout = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.VERTICAL; setPadding(0, 80, 0, 60) }
    layout.addView(webView, android.widget.LinearLayout.LayoutParams(-1, 0, 1f))
    val container = android.widget.FrameLayout(this)
    ${closeRenderer ? `val close = android.widget.Button(this).apply {
      text = "Close RN"
      setOnClickListener { tauriReactHost!!.close(); layout.removeView(container); layout.removeView(this) }
    }
    layout.addView(close)` : ''}
    layout.addView(container, android.widget.LinearLayout.LayoutParams(-1, 0, 2f))
    setContentView(layout)
    return container
  }
  override fun on${host}HostAttached() { super.on${host}HostAttached(); record("attached") }
` : '';
  let probe = readFileSync(new URL('./composition/android/RecreationActivity.kt.fixture', import.meta.url), 'utf8')
    .replace('__BASE_ACTIVITY__', composed && !cng ? 'TauriNativeActivity' : 'MainActivity')
    .replace('__RUNTIME_TELEMETRY__', (composed ? 'report.put("runtime", dev.taurinative.runtime.RuntimeSession.status())' : '') +
      (closeRenderer ? '\n    report.put("rendererDestroyed", tauriReactHost?.destroyed ?: false)' : '') +
      (expo ? `\n    report.put("expo", JSONObject(dev.taurinative.expoprobe.ProbeState.snapshot()))\n    report.put("expoApplicationHasHost", (application as ${cng ? 'MainApplication' : 'TauriNativeApplication'}).reactHost != null)` : '') +
      (cng ? '\n    report.put("cngProbe", packageManager.getApplicationInfo(packageName, android.content.pm.PackageManager.GET_META_DATA).metaData.getString("dev.taurinative.CNG_PROBE"))' : ''))
    .replace('__HOST_LAYOUT__', layout + (rendererOwner ? rendererPermissionActivity : ''));
  if (rendererOwner && !expo) probe = probe.replace('    super.onCreate(state)', '    intent.putExtra("tauri.recreation.recreated", state != null)\n    super.onCreate(state)');
  writeFileSync(path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/RecreationActivity.kt'), probe);
  const file = path.join(android, 'app/src/main/AndroidManifest.xml');
  const text = readFileSync(file, 'utf8'); assert(text.includes(`android:name="${activity}"`));
  writeFileSync(file, text.replace(`android:name="${activity}"`, 'android:name=".RecreationActivity"').replace('<application', `${rendererOwner ? '<uses-permission android:name="android.permission.CAMERA" />\n    ' : ''}<application`));
}

try {
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  const deviceAbi = run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']);
  assert.equal(run('page-size', 'adb', ['-s', device, 'shell', 'getconf', 'PAGE_SIZE']), '16384');
  if (!composed) assert.equal(deviceAbi, 'arm64-v8a', 'Standalone source build selects arm64');
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
    assert(inputReceipt.native.some(slice => slice.abi === deviceAbi), `Export has no slice for emulator ABI ${deviceAbi}`);
    rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
    const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
    const packageName = react ? 'react-native' : 'lynx';
    const packed = prepareRetainedPackage(root, packageName, consumer, run);
    packageSha256 = packed.sha256; packageSource = packed.source;
    const sdk = packed.directory;
    const renderer = path.join(consumer, 'renderer'); mkdirSync(renderer);
    const dependenciesRoot = retainedDependencies(root, packageName);
    const expoDependencies = { '@tauri-native/react-native': '1.0.0-rc.0', expo: '57.0.19', react: '19.2.3', 'react-native': '0.86.3', 'react-native-safe-area-context': '5.7.0', 'expo-file-system': '57.0.6', 'expo-constants': '57.0.17', 'expo-modules-core': '57.0.15', ...(cng ? { 'expo-location': '57.0.15' } : {}) };
    if (expo) {
      const exampleRequire = createRequire(path.join(dependenciesRoot, 'package.json'));
      const expoRequire = createRequire(realpathSync(exampleRequire.resolve('expo/package.json')));
      for (const name of [...Object.keys(expoDependencies), 'babel-preset-expo']) {
        const file = path.join(renderer, 'node_modules', name);
        mkdirSync(path.dirname(file), { recursive: true });
        const directory = name === '@tauri-native/react-native' ? sdk : path.dirname(realpathSync((name.startsWith('expo-') ? expoRequire : exampleRequire).resolve(`${name}/package.json`)));
        symlinkSync(directory, file, 'dir');
      }
    } else symlinkSync(path.join(dependenciesRoot, 'node_modules'), path.join(renderer, 'node_modules'), 'dir');
    writeFileSync(path.join(renderer, 'package.json'), JSON.stringify({ name: 'retained-recreation-consumer', private: true, ...(expo ? { dependencies: expoDependencies } : { type: 'module' }) }));
    let bundle: string;
    if (react) {
      cpSync(path.join(root, 'packages/react-native/test/retained/index.tsx.fixture'), path.join(renderer, 'index.tsx'));
      if (expo) {
        cpSync(path.join(renderer, 'index.tsx'), path.join(renderer, 'fieldnotes.tsx'));
        const entry = readFileSync(path.join(root, 'packages/react-native/test/retained/expo-index.tsx.fixture'), 'utf8');
        assert(entry.includes('state.activityCreates !== 1'));
        // This scenario creates one Expo host per Activity, without JS-only reloads.
        writeFileSync(path.join(renderer, 'index.tsx'), entry.replace('state.activityCreates !== 1', 'state.activityCreates !== state.created')
          .replace('links ${state.intents} back ${state.backs}', 'activities ${state.activityCreates}'));
        cpSync(path.join(root, 'packages/react-native/test/retained/expo-probe'), path.join(renderer, 'modules/retained-expo-probe'), { recursive: true });
        writeFileSync(path.join(renderer, 'app.json'), JSON.stringify({ expo: { name: 'Retained Expo Fieldnotes', slug: 'retained-expo-fieldnotes', android: { package: appId } } }));
      }
      if (rendererOwner) prepareRendererPermissions(renderer, sdk, rendererOwner, expo);
      cpSync(path.join(root, 'packages/react-native/test/retained/build.cjs.fixture'), path.join(renderer, 'build.cjs'));
      writeFileSync(path.join(renderer, 'babel.config.json'), '{"presets":["babel-preset-expo"]}\n');
      run('renderer-build', process.execPath, ['build.cjs', 'android'], renderer, { ...env, PROOF_REPOSITORY: root, RETAINED_DEPENDENCIES: dependenciesRoot, RETAINED_SDK_DIR: sdk });
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
    const generated = cng ? path.join(renderer, 'android') : path.join(expo ? renderer : consumer, 'composed application');
    const android = cng ? generated : path.join(generated, 'android');
    const { composeAndroid } = createRequire(import.meta.url)(path.join(sdk, react ? 'compose.js' : 'compose.cjs'));
    let composition;
    if (cng) {
      configureCng(renderer, copied, 'android', bundle);
      const { prebuildRetainedExpo } = createRequire(path.join(renderer, 'package.json'))('@tauri-native/react-native/prebuild');
      composition = await prebuildRetainedExpo({ projectRoot: renderer, platform: 'android', clean: true });
      writeFileSync(path.join(evidence, 'cng-prebuild.log'), composition.log);
      cngCompositionSha256 = sha256(readFileSync(path.join(generated, 'tauri-native-composition.json')));
    } else composition = composeAndroid({ artifactsDir: copied, outputDir: generated, bundleFile: bundle,
      ...(react ? { rendererDir: renderer, moduleName: expo ? 'main' : 'RetainedFieldnotes', expo } : {}) });
    addProbe(android, cng ? '.MainActivity' : composition.activity);
    const gradle = path.join(android, 'app/build.gradle.kts');
    writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'));
    run('source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, { ...env, PATH: sourceFreePath });
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
  if (initiallyUnpermitted) flow('initial-permission', composed
    ? '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"'
    : '- tapOn: "Check location permission"\n- assertVisible: "Location permission prompt"');
  else flow('initial-plugin', composed
    ? `- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "${name} events 0"\n- tapOn: "Request permission"\n- tapOn: "(?i)While using the app"\n- assertVisible: "Permission granted"\n- tapOn: "Save location"\n- assertVisible: "${name} note 1"\n- assertVisible: "${name} events 1"`
    : '- tapOn: "Request location permission"\n- tapOn: "(?i)While using the app"\n- assertVisible: "Location permission granted"\n- tapOn: "Save location note"\n- assertVisible: "Saved location note 1"');
  if (expo) expoModules(0);
  const initial = await inspect('before');
  if (cng) assert.equal(initial.cngProbe, 'actual config plugin');
  if (expo) assertExpo(initial, 0);
  assert.equal(initial.result.baseline.passed, true);
  assert.equal(initial.result.snapshot.value, 45); assert.equal(initial.result.snapshot.setupCount, 1); assert.equal(initial.result.snapshot.pluginSetupCount, 1);
  assert.equal(initial.result.plugins.notes.length, initiallyUnpermitted ? 0 : 1);
  assert.equal(initial.result.permission.location, initiallyUnpermitted ? 'prompt' : 'granted');
  if (composed) assert.equal(initial.runtime.listeners, 1);
  for (let index = 1; index <= 2; index++) {
    // Tauri caches rationale only for its own requests. A renderer-owned denial
    // leaves that cache untouched; an OS grant is visible to every owner.
    const permission = pendingPermission ? index === 1 ? rendererOwner ? 'prompt' : 'prompt-with-rationale' : 'granted'
      : freshPermission ? index === 1 ? 'prompt' : 'prompt-with-rationale' : 'granted';
    if (pendingPermission) {
      flow(`pending-dialog-${index}`, (rendererOwner === 'rn' ? '- tapOn: "RN permissions"\n- tapOn: "RN request then save"' : rendererOwner === 'expo' ? '- scrollUntilVisible:\n    element:\n      text: "Expo request then save"\n    direction: DOWN\n- tapOn: "Expo request then save"' : '- tapOn: "Request then save"') + '\n- assertVisible: "(?i)While using the app"');
      if (rendererOwner) assert.equal(rendererResults('os-result').length, 2 * (index - 1));
      else assert.equal(permissionResults().length, index - 1, 'The real OS result is still pending');
      run(`pending-recreate-${index}`, 'adb', ['-s', device, 'shell', 'am', 'broadcast', '-a', `${appId}.RECREATE`, '-p', appId]);
      await until(() => events().filter(row => row.stage === 'create').length === index + 1 &&
        events().filter(row => row.stage === 'destroy-after').length === index);
      const recreated = events().filter(row => row.stage === 'create').at(-1)!;
      if (rendererOwner) assert.equal(rendererResults('os-result').length, 2 * (index - 1), 'Recreation must not synthesize or settle the OS result');
      else assert.equal(permissionResults().length, index - 1, 'Recreation must not synthesize or settle the OS result');
      assert.equal(events().filter(row => row.stage === 'broadcast-recreate').at(-1)!.focused, false);
      flow(`pending-result-${index}`, `- assertVisible: "(?i)While using the app"\n- tapOn: "${index === 1 ? '(?i)Don.t allow' : '(?i)While using the app'}"`);
      if (rendererOwner) {
        await until(() => rendererResults('os-result').length === 2 * index - 1);
        assert.equal(rendererResults('listener-result').length, index - 1, 'The retired renderer must not receive the old OS result');
        const old = rendererResults('os-result').at(-1)!;
        assert.equal(old.activity, recreated.activity);
        // Observe a request after real resume. Bare RN gates its mount effect
        // with AppState; no resumed lifecycle is forced over the prior OS dialog.
        await until(() => rendererResults('request').filter(row => row.permissions.includes('android.permission.CAMERA')).length === index);
        const nextRequest = rendererResults('request').at(-1)!;
        assert.equal(nextRequest.activity, recreated.activity);
        assert.deepEqual(nextRequest.permissions, ['android.permission.CAMERA']);
        assert.deepEqual(Object.keys(old.grants).sort(), ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']);
        assert(Object.values(old.grants).every(granted => granted === (index === 2)));
        flow(`replacement-camera-${index}`, `- assertVisible: "(?is).*take pictures.*record video.*"\n- tapOn: "${index === 1 ? '(?i)Don.t allow' : '(?i)While using the app'}"\n- scrollUntilVisible:\n    element:\n      text: "Replacement camera result"\n    direction: DOWN\n- tapOn: "Replacement camera result"\n- scrollUntilVisible:\n    element:\n      text: "Replacement camera ${index === 1 ? 'denied' : 'granted'}"\n    direction: UP`);
        await until(() => rendererResults('os-result').length === 2 * index && rendererResults('listener-result').length === index);
        const current = rendererResults('listener-result').at(-1)!;
        assert.equal(current.activity, recreated.activity);
        assert.deepEqual(current.permissions, ['android.permission.CAMERA']);
        assert.deepEqual(current.grants, [index === 1 ? -1 : 0]);
        assert.deepEqual(rendererResults('os-result').at(-1)!.grants, { 'android.permission.CAMERA': index === 2 });
      } else {
        await until(() => permissionResults().length === index);
        const result = permissionResults().at(-1)!;
        assert.equal(result.activity, recreated.activity, 'The original Tauri callback executes for the replacement Activity');
        assert.deepEqual(Object.keys(result.grants).sort(), ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']);
        assert(Object.values(result.grants).every(granted => granted === (index === 2)));
      }
    } else action('recreate');
    await until(() => events().filter(row => row.stage === 'create').length === index + 1 && events().filter(row => row.stage === 'webview').length === index + 1);
    flow(`recreated-ui-${index}`, composed
      ? `${rendererOwner ? '' : '- assertVisible: "Tauri 45 setup 1 plugins 1"\n'}- assertVisible: "${name} events 0"\n- tapOn: "Check permission"\n- assertVisible: "Permission ${permission}"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes ${initiallyUnpermitted ? 0 : 1} setup 1 plugins 1"`
      : `- tapOn: "Check location permission"\n- assertVisible: "Location permission ${permission}"\n- tapOn: "Refresh notes and links"`);
    if (expo) expoModules(index);
    const after = await inspect(`after-${index}`);
    if (cng) assert.equal(after.cngProbe, 'actual config plugin');
    if (expo) {
      assertExpo(after, index);
      assert(after.expo.resumes > initial.expo.resumes && after.expo.pauses > initial.expo.pauses);
    }
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
  const noteCount = initiallyUnpermitted ? 1 : 2;
  flow('post-recreation-save', composed ? `- tapOn: "Save location"\n- assertVisible: "${name} note ${noteCount}"\n- assertVisible: "${name} events 1"`
    : `- tapOn: "Save location note"\n- assertVisible: "Saved location note ${noteCount}"`);
  const beforeLink = expo ? await inspect('before-link') : undefined;
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/2', '-p', appId]);
  flow('post-recreation-link', composed ? `- assertVisible: "${name} events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes ${noteCount} setup 1 plugins 1"${rendererOwner && !expo ? '\n- assertVisible: "RN links 1 back 0"\n- pressKey: Back\n- assertVisible: "RN links 1 back 1"' : ''}`
    : '- assertVisible: "Links received 1"\n- tapOn: "Refresh notes and links"');
  const final = await inspect('final');
  assert.equal(final.result.plugins.notes.length, noteCount); assert.deepEqual(final.result.plugins.links, ['tauri-fieldnotes://notes/2']);
  for (const note of final.result.plugins.notes) {
    assert.equal(note.text, composed ? `A ${name} place to remember` : 'A place to remember');
    assert(Math.abs(note.latitude - 37.5665) < 0.01 && Math.abs(note.longitude - 126.978) < 0.01);
  }
  let rendererClosed: any;
  if (expo) {
    assertExpo(final, 2);
    // Each telemetry inspect also passes through the original onNewIntent.
    assert.equal(final.expo.intents - beforeLink.expo.intents, 2, 'One deep link plus the final inspect reach Expo exactly once');
  }
  if (closeRenderer) {
    const closed = expo ? 'expo-closed' : 'react-closed';
    flow(expo ? 'expo-close' : 'react-close', '- tapOn: "Close RN"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 1"');
    await until(() => {
      action(closed);
      rendererClosed = events().filter(row => row.stage === closed).at(-1);
      return rendererClosed?.rendererDestroyed === true && (!expo ||
        (rendererClosed.expo.created === 3 && rendererClosed.expo.destroyed === 3 && rendererClosed.expoApplicationHasHost === false));
    });
    assert.equal(rendererClosed.runtime.listeners, 0);
    assert.deepEqual(rendererClosed.result.snapshot, initial.result.snapshot);
    assert.deepEqual(rendererClosed.result.plugins, final.result.plugins);
    if (cng) assert.equal(rendererClosed.cngProbe, 'actual config plugin');
  }
  const observed = events();
  if (pendingPermission) assert.equal(permissionResults().length, rendererOwner ? 0 : 2, 'Only Tauri-owned OS results reach the original Tauri callback');
  const created = observed.filter(row => row.stage === 'create');
  if (rendererOwner && !expo) {
    const props = rendererResults('props');
    assert.deepEqual(props.map(row => row.recreated), [false, true, true]);
    assert.deepEqual(props.map(row => row.activity), created.map(row => row.activity));
  }
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
    ...(composed ? { artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))), packageSha256, packageSource, deviceAbi, pageSize: 16384, bundleSha256, sourceFreeBuild: `PATH=${sourceFreePath}`, artifactUnchanged: true }
      : { sourceHashes: producerBefore, producerUnchanged: true }),
    baseline: initial.result.baseline, freshPermission, pendingPermission, recreations: 2, nativeUiFlows: (pendingPermission ? 9 : freshPermission ? 7 : 5) + (expo ? 4 : 0) + (rendererOwner ? 2 : 0) + (rendererOwner && !expo ? 1 : 0), events: observed,
    ...(closeRenderer ? { rendererClosed: { destroyed: rendererClosed.rendererDestroyed, listeners: rendererClosed.runtime.listeners } } : {}),
    cng: cng ? { nativeProbe: initial.cngProbe, compositionSha256: cngCompositionSha256 } : false,
    ...(expo ? { expo: { initial: initial.expo, final: final.expo, closed: rendererClosed.expo, permissionOwner: rendererOwner ?? 'tauri', configuration: cng ? 'Actual Expo prebuild with retained template and config plugins' : 'package-owned composition' } } : {}),
    ...(rendererOwner ? { rendererPermissionOwner: rendererOwner, rendererRequests: rendererResults('request'), rendererListenerResults: rendererResults('listener-result'), rendererOsResults: rendererResults('os-result') } : {}),
    ...(rendererOwner && !expo ? { rendererInitialProps: rendererResults('props'), bareInstrumentation: 'The copied host forwards the probe Activity saved-state observation as a standard RN initial prop. JS waits for real AppState active before its replacement camera request; no Activity lifecycle callback is synthesized.' } : {}),
    ...(pendingPermission ? { permissionResults: permissionResults(), instrumentation: rendererOwner ? 'Test-only broadcast triggers real recreation. The replacement JS renderer automatically requests camera through the real RN/Expo API after resume. The prior OS location result must not reach the replacement camera listener. The copied SDK logs its unchanged AndroidX callback; the Activity logs before forwarding to the actual module listener. Only the disposable consumer declares camera permission.' : 'Test-only broadcast receiver triggers real recreation without foregrounding the Activity. Copied PluginManager logs after the unchanged original permission callback returns; no OS result or native routing is substituted.' } : {}),
    limits: `${rendererOwner ? 'RN/Expo location permission remains pending during real recreation. The replacement renderer requests camera after actual resume; bare RN explicitly waits for AppState active. Only its own camera result may reach its new listener. Retired location continuations must not save. Both requests use actual OS denial/grant dialogs.' : pendingPermission ? 'Both recreations occur while actual OS permission dialogs remain pending. Denial and grant each reach the original Tauri callback on the replacement Activity; retired renderer continuations save no sentinel note.' : freshPermission ? 'First permission request after recreation is denied through OS UI; a second recreation preserves the rationale state, and a later OS grant allows location save. Pending OS callbacks are a separate gate.' : 'Location permission granted before recreation; fresh/pending permissions are separate gates.'} Process death is a separate gate. The original fixture startup self-test expects initial State 40; the recreated document keeps State 45, verified directly through original IPC.`,
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
      if (rendererOwner) writeFileSync(path.join(evidence, 'renderer-permissions.json'), JSON.stringify({ requests: rendererResults('request'), listenerResults: rendererResults('listener-result'), osResults: rendererResults('os-result') }, null, 2) + '\n');
      if (pendingPermission) writeFileSync(path.join(evidence, 'permission-results.json'), JSON.stringify(permissionResults(), null, 2) + '\n');
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
