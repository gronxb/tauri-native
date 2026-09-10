import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../cli/src/artifacts/files.ts';
import { acquireMobileTest } from '../../cli/test/runtime/mobile-lock.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const artifact = path.resolve(process.argv[2] ?? path.join(root, 'target/retained-portability/exported-runtime'));
const manifest = readRetainedArtifacts(artifact);
assert(manifest.platform === 'android' && manifest.profile === 'release');
assert.equal(manifest.bootstrap.applicationId, 'dev.taurinative.mobilefieldnotes');
const device = process.env.ANDROID_SERIAL;
assert(device, 'Choose an arm64 ANDROID_SERIAL emulator');
const evidence = path.join(root, 'target/lynx-retained-android');
const consumer = path.join(evidence, 'source free consumer');
const renderer = path.join(consumer, 'renderer');
const generated = path.join(consumer, 'composed application');
const android = path.join(generated, 'android');
const appId = manifest.bootstrap.applicationId;
const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '' };
const release = acquireMobileTest(root);
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'report.json'), { force: true });
let installed = false;
let pid = '';
function run(label: string, command: string, args: string[], cwd = consumer, environment = env) {
  console.log(`> lynx-retained-android: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: command === 'maestro' ? 180000 : command === 'adb' ? 120000 : undefined });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
function report(kind = 'lifecycle') {
  const result = spawnSync('adb', ['-s', device!, 'logcat', '-d', '--pid', pid, '-v', 'raw', '-s', 'TauriLynxAcceptance:I', '*:S'], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const reports = result.stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  const found = reports.filter(report => report.kind === kind).at(-1);
  assert(found, `No ${kind} report for process ${pid}; readiness: ${JSON.stringify(reports.filter(report => report.kind === 'readiness').at(-1))}`);
  return found.report;
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { if (condition()) return; } catch (error) { if (Date.now() >= deadline) throw error; }
    assert(Date.now() < deadline, 'Lynx retained scenario did not reach the expected state');
    await setTimeout(300);
  }
}
function flow(label: string, steps: string) {
  const file = path.join(evidence, `${label}.yaml`);
  writeFileSync(file, `appId: ${appId}\n---\n${steps}\n`);
  run(label, 'maestro', ['--udid', device!, 'test', '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), file]);
}
try {
  rmSync(consumer, { recursive: true, force: true }); mkdirSync(consumer, { recursive: true });
  const copied = path.join(consumer, 'copied runtime'); cpSync(artifact, copied, { recursive: true });
  assert.deepEqual(readRetainedArtifacts(copied), manifest);
  assert.equal(run('emulator', 'adb', ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu']), '1');
  assert.equal(run('abi', 'adb', ['-s', device, 'shell', 'getprop', 'ro.product.cpu.abi']), 'arm64-v8a');
  // The consumer uses the actual npm tarball. No workspace source alias supplies the module.
  run('package', 'npm', ['pack', '--pack-destination', consumer], path.join(root, 'packages/lynx'));
  run('unpack', 'tar', ['-xzf', 'tauri-native-lynx-1.0.0-rc.0.tgz']);
  const sdk = path.join(consumer, 'package');
  mkdirSync(path.join(renderer, 'src'), { recursive: true });
  symlinkSync(path.join(root, 'examples/lynx/node_modules'), path.join(renderer, 'node_modules'), 'dir');
  cpSync(new URL('./retained/App.tsx.fixture', import.meta.url), path.join(renderer, 'src/App.tsx'));
  cpSync(path.join(root, 'packages/cli/test/runtime/composition/lynx/index.tsx.fixture'), path.join(renderer, 'src/index.tsx'));
  writeFileSync(path.join(renderer, 'package.json'), '{"name":"packed-retained-lynx-consumer","private":true,"type":"module"}\n');
  writeFileSync(path.join(renderer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@lynx-js/react', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
  writeFileSync(path.join(renderer, 'lynx.config.ts'), `import { defineConfig } from '@lynx-js/rspeedy';\nimport { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin';\nexport default defineConfig({ plugins: [pluginReactLynx()], source: { alias: { '@tauri-native/lynx/retained': ${JSON.stringify(path.join(sdk, 'src/retained.ts'))} } } });\n`);
  run('renderer-build', path.join(renderer, 'node_modules/.bin/rspeedy'), ['build', '--mode', 'production'], renderer);
  const bundle = path.join(renderer, 'dist/main.lynx.bundle');
  const { composeAndroid } = createRequire(import.meta.url)(path.join(sdk, 'compose.cjs'));
  const { readRetainedArtifacts: packedReader } = createRequire(import.meta.url)(path.join(sdk, 'retained-artifacts.cjs'));
  assert.deepEqual(packedReader(copied), manifest);
  const options = { artifactsDir: copied, outputDir: generated, bundleFile: bundle };
  const composition = composeAndroid(options); assert.equal(composition.changed, true);
  assert.equal(composeAndroid(options).changed, false);
  const receipt = JSON.parse(readFileSync(path.join(generated, 'tauri-native-composition.json'), 'utf8'));
  const manifestFile = path.join(android, 'app/src/main/AndroidManifest.xml');
  const compositionManifest = readFileSync(manifestFile, 'utf8');
  writeFileSync(manifestFile, compositionManifest.replace(composition.activity, `${appId}.AcceptanceActivity`));
  cpSync(new URL('./retained/AcceptanceActivity.kt.fixture', import.meta.url), path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/AcceptanceActivity.kt'));
  const gradle = path.join(android, 'app/build.gradle.kts');
  writeFileSync(gradle, readFileSync(gradle, 'utf8').replace('getByName("release") {', 'getByName("release") {\n            signingConfig = signingConfigs.getByName("debug")'));
  run('source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const apk = path.join(android, 'app/build/outputs/apk/release/app-release.apk');
  const apkMetadata = run('apk-metadata', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk]);
  assert(!apkMetadata.includes('application-debuggable'), 'Acceptance must execute a non-debuggable Release APK');
  run('apk-alignment', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  const libraries = run('apk-libraries', 'unzip', ['-Z1', apk]).split('\n').filter(file => file.startsWith('lib/') && file.endsWith('.so'));
  assert(libraries.length > 0);
  assert.deepEqual([...new Set(libraries.map(file => file.split('/')[1]))].sort(), manifest.native.map(slice => slice.abi).sort(), 'Renderer ABIs must match the exported Tauri slices');
  const elf = path.join(evidence, 'elf'); mkdirSync(elf, { recursive: true });
  for (const library of libraries) {
    const label = library.replaceAll('/', '-');
    run(`extract-${label}`, 'unzip', ['-o', apk, library, '-d', elf]);
    const headers = run(`elf-${label}`, path.join(process.env.NDK_HOME!, 'toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf'), ['-lW', path.join(elf, library)]);
    const loads = headers.split('\n').filter(line => line.trim().startsWith('LOAD '));
    assert(loads.length && loads.every(line => BigInt(line.trim().split(/\s+/).at(-1)!) >= 16384n), `${library} must be 16 KB aligned`);
  }
  run('install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('gps', 'adb', ['-s', device, 'emu', 'geo', 'fix', '126.9780', '37.5665']);
  run('launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/.AcceptanceActivity`]);
  pid = run('pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  await until(() => report('baseline').passed === true);
  const baseline = report('baseline');
  flow('initial', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"\n- tapOn: "Check permission"\n- assertVisible: "Permission prompt"');
  const initial = report(); assert.equal(initial.listeners, 1);
  flow('deny-permission', '- tapOn: "Request permission"\n- tapOn: "(?i)Don.t allow"\n- assertVisible: "Permission prompt-with-rationale"\n- tapOn: "Save location"\n- assertVisible: "Location denied"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"');
  const beforePermission = report();
  flow('retire-permission', '- tapOn: "Retire on pause"\n- tapOn: "Request then save"\n- assertVisible: "(?i)While using the app"');
  await until(() => report().permissionRetirement?.generation === 2);
  const permissionRetired = report();
  assert.equal(permissionRetired.retireOnPause, false);
  assert.equal(permissionRetired.permissionRetirement.listeners, 0);
  assert.equal(permissionRetired.permissionRetirement.runtimeStatus, 'ready');
  assert.equal(permissionRetired.permissionRetirement.pid, beforePermission.pid);
  assert(permissionRetired.permissionRetirement.paused > beforePermission.paused);
  flow('grant-permission', '- tapOn: "(?i)While using the app"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Check permission"\n- assertVisible: "Permission granted"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 0 notes 0 setup 1 plugins 1"\n- tapOn: "Save location"\n- assertVisible: "Lynx note 1"\n- assertVisible: "Lynx events 1"');
  const beforeBackground = report();
  flow('background', '- pressKey: Home');
  await until(() => report().stopped > beforeBackground.stopped && report().paused > beforeBackground.paused);
  run('deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1', '-p', appId]);
  flow('resume', '- assertVisible: "Lynx events 2"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"\n- tapOn: "Remount Lynx"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 1 setup 1 plugins 1"');
  const remounted = report();
  assert.deepEqual(remounted.receivedIntents, ['tauri-fieldnotes://notes/1']);
  assert.equal(remounted.pid, initial.pid); assert.equal(remounted.generation, 3);
  assert.equal(remounted.listenersAfterRelease, 0); assert.equal(remounted.listeners, 1);
  assert(remounted.resumed >= 2 && remounted.paused >= 1);
  run('remounted-deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/1?remounted=1', '-p', appId]);
  flow('fresh-events', '- assertVisible: "Lynx events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 2 notes 1 setup 1 plugins 1"');
  assert.deepEqual(report().receivedIntents, ['tauri-fieldnotes://notes/1', 'tauri-fieldnotes://notes/1?remounted=1']);
  const notes = report().notes; assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'A Lynx place to remember');
  assert(Math.abs(notes[0].latitude - 37.5665) < 0.01 && Math.abs(notes[0].longitude - 126.978) < 0.01);
  flow('remove-renderer', '- tapOn: "Close Lynx"\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received 2"');
  const closed = report(); assert.equal(closed.listeners, 0); assert.equal(closed.hostClosed, true);
  assert.equal(closed.pid, initial.pid);
  assert.equal(run('final-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]), pid);
  const acceptanceApk = path.join(evidence, 'acceptance-release.apk'); cpSync(apk, acceptanceApk);
  run('uninstall-acceptance', 'adb', ['-s', device, 'uninstall', appId]); installed = false;
  writeFileSync(manifestFile, compositionManifest);
  rmSync(path.join(android, 'app/src/main/java/dev/taurinative/mobilefieldnotes/AcceptanceActivity.kt'));
  run('default-source-free-build', './gradlew', ['--no-daemon', 'assembleRelease'], android, { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  const defaultMetadata = run('default-apk-metadata', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk]);
  assert(!defaultMetadata.includes('application-debuggable'));
  run('default-apk-alignment', path.join(process.env.ANDROID_HOME!, 'build-tools/36.0.0/zipalign'), ['-c', '-P', '16', '-v', '4', apk]);
  const defaultLibraries = run('default-apk-libraries', 'unzip', ['-Z1', apk]).split('\n').filter(file => file.startsWith('lib/') && file.endsWith('.so'));
  assert.deepEqual(defaultLibraries, libraries);
  for (const library of libraries) {
    const bytes = spawnSync('unzip', ['-p', apk, library], { maxBuffer: 128 * 1024 * 1024 });
    assert.equal(bytes.status, 0); assert.equal(sha256(bytes.stdout), sha256(readFileSync(path.join(elf, library))));
  }
  run('default-install', 'adb', ['-s', device, 'install', apk]); installed = true;
  run('default-launch', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-n', `${appId}/${composition.activity}`]);
  pid = run('default-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]);
  flow('default-integration', '- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "Lynx events 0"\n- tapOn: "Reject session"\n- assertVisible: "Session caller_denied"\n- tapOn: "Deny capability"\n- assertVisible: "Tauri capability denied"\n- tapOn: "Deny native caller"\n- assertVisible: "Native caller denied"');
  run('default-deep-link', 'adb', ['-s', device, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'tauri-fieldnotes://notes/default', '-p', appId]);
  flow('default-link', '- assertVisible: "Lynx events 1"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links 1 notes 0 setup 1 plugins 1"');
  assert.equal(run('default-final-pid', 'adb', ['-s', device, 'shell', 'pidof', appId]), pid);
  assert.deepEqual(packedReader(copied), manifest);
  assert.deepEqual(readRetainedArtifacts(artifact), manifest);
  assert(!existsSync(path.join(consumer, 'src-tauri')), 'Consumer has no Rust producer');
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, platform: 'android', profile: 'release', formatVersion: 2, abiVersion: 3,
    renderer: 'Lynx 4.0.1 / PrimJS 4.0.0', sourceFree: true, sourceFreeBuild: 'PATH=/usr/bin:/bin:/usr/sbin:/sbin ./gradlew --no-daemon assembleRelease',
    nonDebuggable: true, libraries, elfAlignment: 'All packaged LOAD segments >= 16 KB; zipalign -c -P 16 -v 4 passed',
    packageSha256: sha256(readFileSync(path.join(consumer, 'tauri-native-lynx-1.0.0-rc.0.tgz'))), artifactSha256: sha256(readFileSync(path.join(artifact, 'manifest.json'))),
    apkSha256: sha256(readFileSync(acceptanceApk)), bundleSha256: sha256(readFileSync(bundle)), baseline, initial, permissionRetired, remounted, closed, notes,
    composition: receipt, defaultActivity: { activity: composition.activity, pid, apkSha256: sha256(readFileSync(apk)), overriddenHooks: false, identicalNativeLibraries: libraries.length },
    uiScenarios: ['shared original state/setup', 'Tauri ACL and native caller denial', 'OS permission denial/grant', 'renderer retirement during pending OS permission prevents the old continuation save', 'undeclared session preserves original caller_denied code/message', 'save and event', 'background deep link and event', 'renderer replacement retires native subscriptions', 'fresh renderer receives only fresh events', 'remove Lynx and keep original Tauri frontend', 'unmodified generated Activity/default layout', 'default SDK composition retains original Tauri ACL/state/deep-link events'],
    testOnlyIntegration: 'Acceptance subclass provides layout, baseline readiness and telemetry only. The packed composer/SDK own startup, document readiness, attachment and lifecycle forwarding. A second Release APK executes the unmodified generated Activity/default layout without acceptance hooks. Original MainActivity/TauriActivity and plugin/bootstrap ownership remain. Third-party autolinking and retained TauriView remain open.',
    testOnlySigning: 'Non-debuggable Release with R8 optimization and a debug test signing key; process-scoped logcat telemetry',
  }, null, 2) + '\n');
  console.log(`PASS: packed Lynx retained Android SDK native acceptance. ${evidence}/report.json`);
} finally {
  try { if (installed) run('uninstall', 'adb', ['-s', device, 'uninstall', appId]); }
  finally { release(); assert.deepEqual(readRetainedArtifacts(artifact), manifest); }
}
