import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, sha256 } from '../../src/artifacts/files.ts';

const root = realpathSync(fileURLToPath(new URL('../../../..', import.meta.url)));
const changedRust = process.env.FIELDNOTES_CHANGED_RUST === '1';
const evidence = path.join(root, changedRust ? 'target/document-feature-changed' : 'target/document-feature');
const ios = process.env.IOS_SIMULATOR_UDID, android = process.env.ANDROID_SERIAL;
assert(ios && android, 'Set IOS_SIMULATOR_UDID and ANDROID_SERIAL to dedicated test devices.');
assert(process.env.NATIVE_HOST_PATH, 'Set NATIVE_HOST_PATH to Node/Ruby/native tools without cargo or rustc.');
const hostEnv = { ...process.env, PATH: process.env.NATIVE_HOST_PATH };
for (const tool of ['cargo', 'rustc']) assert.equal(spawnSync(tool, ['--version'], { env: hostEnv }).error?.code, 'ENOENT', `${tool} must be absent during host builds`);
const profiles = [
  { name: 'rn', directory: process.env.RN_HOST, sdk: 'react-native', scheme: 'TauriArtifactHost', appId: 'dev.taurinative.rnartifacttest' },
  { name: 'lynx', directory: process.env.LYNX_HOST, sdk: 'lynx', scheme: 'Hello-Lynx', appId: 'dev.taurinative.lynxartifacttest' },
  { name: 'expo', directory: process.env.EXPO_HOST, sdk: 'react-native', scheme: 'TauriArtifactExpo', appId: 'dev.taurinative.rnartifacttest' },
];
for (const profile of profiles) {
  assert(profile.directory, `Set ${profile.name.toUpperCase()}_HOST to a disposable independent integration host; see the feature gate README.`);
  profile.directory = realpathSync(profile.directory);
  assert(profile.directory !== root && !profile.directory.startsWith(root + path.sep), 'Hosts must be outside the checkout');
  assert(existsSync(path.join(profile.directory, `ios/${profile.scheme}.xcodeproj`)), `Missing ${profile.scheme} scaffold`);
}
mkdirSync(evidence, { recursive: true });
rmSync(path.join(evidence, 'native-report.json'), { force: true });
const timings = {};
function run(label, command, args, cwd = root, env = process.env) {
  console.log(`> ${label}: ${command} ${args.join(' ')}`);
  const log = path.join(evidence, `${label}.log`);
  const fd = openSync(log, 'w');
  const started = performance.now();
  let result;
  try { result = spawnSync(command, args, { cwd, env, stdio: ['ignore', fd, fd] }); }
  finally { closeSync(fd); }
  timings[label] = Math.round(performance.now() - started);
  assert.equal(result.status, 0, `${label} failed: ${result.error ?? ''}\n${readFileSync(log, 'utf8').slice(-10000)}`);
  return readFileSync(log, 'utf8');
}

run('export', process.execPath, ['--experimental-strip-types', path.join(root, 'packages/cli/test/feature/export.mjs')]);
const exported = JSON.parse(readFileSync(path.join(evidence, 'export-report.json')));
assert.equal(exported.changedRust, changedRust);
assert(exported.producerDeleted && exported.producerUnchanged && exported.desktopFrontend.every(result => result.passed));
const packageDirectory = path.join(evidence, 'packages'); mkdirSync(packageDirectory, { recursive: true });
const packages = {};
for (const sdk of ['react-native', 'lynx']) {
  run(`build-${sdk}`, 'nub', ['--cwd', path.join(root, 'packages', sdk), 'run', 'build']);
  const destination = path.join(packageDirectory, sdk);
  rmSync(destination, { recursive: true, force: true }); mkdirSync(destination);
  run(`pack-${sdk}`, 'npm', ['pack', path.join(root, 'packages', sdk), '--ignore-scripts', '--pack-destination', destination]);
  const files = readdirSync(destination);
  assert(files.length === 1 && files[0].endsWith('.tgz'), 'Packing must produce one fresh tarball');
  packages[sdk] = path.join(destination, files[0]);
}
for (const profile of profiles) {
  const vendor = path.join(profile.directory, 'vendor-packages'); mkdirSync(vendor, { recursive: true });
  const tarball = path.join(vendor, path.basename(packages[profile.sdk]));
  cpSync(packages[profile.sdk], tarball);
  run(`${profile.name}-install`, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `./vendor-packages/${path.basename(tarball)}`, ...(profile.sdk === 'react-native' ? ['react-native-safe-area-context@5.7.0'] : [])], profile.directory, hostEnv);
  const sdkPath = path.join(profile.directory, 'node_modules/@tauri-native', profile.sdk);
  assert(realpathSync(sdkPath).startsWith(profile.directory + path.sep), 'The SDK must be unpacked inside the independent host');
}
run('prepare-hosts', process.execPath, [path.join(root, 'scripts/prepare-feature-hosts.mjs'), ...profiles.map(profile => profile.directory)], root, hostEnv);
const expo = profiles.find(profile => profile.name === 'expo');
run('expo-prebuild', path.join(expo.directory, 'node_modules/.bin/expo'), ['prebuild', '--no-install', '--no-clean'], expo.directory, hostEnv);

const featureFlow = path.join(evidence, 'feature-contract.yaml');
writeFileSync(featureFlow, readFileSync(path.join(root, 'scripts/feature-contract.yaml'), 'utf8')
  .replace('appId: ${APP_ID}', 'appId: ${APP_ID}\nandroidWebViewHierarchy: devtools')
  .replace('Use a title between', changedRust ? 'Enter a title between' : 'Use a title between'));
const pendingFlow = path.join(evidence, 'feature-pending-contract.yaml');
writeFileSync(pendingFlow, readFileSync(path.join(root, 'scripts/feature-pending-contract.yaml'), 'utf8')
  .replace('appId: ${APP_ID}', 'appId: ${APP_ID}\nandroidWebViewHierarchy: devtools'));
if (changedRust) {
  const baseline = JSON.parse(readFileSync(path.join(root, 'target/document-feature/export-report.json')));
  assert.deepEqual(exported.artifacts.ios.files.filter(file => file.path.startsWith('TauriNativeAssets.bundle/')),
    baseline.artifacts.ios.files.filter(file => file.path.startsWith('TauriNativeAssets.bundle/')), 'Rust edits must reuse identical frontend bytes');
  assert.deepEqual(Object.keys(exported.sourceHashes).sort(), Object.keys(baseline.sourceHashes).sort());
  assert.deepEqual(Object.keys(exported.sourceHashes).filter(file => exported.sourceHashes[file] !== baseline.sourceHashes[file]),
    ['src-tauri/src/lib.rs'], 'Only the ordinary Rust command implementation changes');
}
const results = [];
for (const profile of profiles) {
  const host = profile.directory;
  for (const platform of ['ios', 'android']) {
    const label = `${profile.name}-${platform}`;
    try {
      const received = path.join(host, 'tauri-native', platform);
      assert.deepEqual(inventory(received), exported.artifacts[platform].files, 'Only copied artifacts are consumed');
      if (profile.name === 'lynx') run(`${label}-bundle`, 'npm', ['run', platform === 'ios' ? 'build:ios' : 'build'], host, hostEnv);
      if (platform === 'ios') {
        if (profile.name === 'lynx') run(`${label}-pods`, 'bundle', ['exec', 'pod', 'install'], path.join(host, 'ios'), { ...hostEnv, BUNDLE_PATH: 'vendor/bundle' });
        else run(`${label}-pods`, 'pod', ['install'], path.join(host, 'ios'), hostEnv);
        run(`${label}-build`, 'xcodebuild', ['-workspace', `${profile.scheme}.xcworkspace`, '-scheme', profile.scheme, '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', '../build-ios', 'CODE_SIGNING_ALLOWED=NO', 'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', '-jobs', '2'], path.join(host, 'ios'), hostEnv);
        profile.app = path.join(host, `build-ios/Build/Products/Release-iphonesimulator/${profile.scheme}.app`);
        run(`${label}-install-app`, 'xcrun', ['simctl', 'install', ios, profile.app], host, hostEnv);
      } else {
        // Maestro's Android accessibility snapshots can omit a recreated WebView's
        // entire DOM. Enable its documented CDP inspection in disposable hosts only.
        const application = path.join(host, 'android/app/src/main/java', profile.name === 'lynx'
          ? 'dev/taurinative/lynxexample/TauriNativeApplication.java' : 'dev/taurinative/rnartifacttest/MainApplication.kt');
        const source = readFileSync(application, 'utf8');
        const inspection = 'android.webkit.WebView.setWebContentsDebuggingEnabled(true)';
        if (!source.includes(inspection)) {
          assert(source.includes('super.onCreate()'), 'Expected the disposable application scaffold');
          writeFileSync(application, source.replace(/super\.onCreate\(\);?/, value =>
            `${value}\n    ${inspection}${profile.name === 'lynx' ? ';' : ''} // Disposable Maestro host only.`));
        }
        run(`${label}-build`, './gradlew', ['--no-daemon', 'assembleRelease', '--max-workers=2'], path.join(host, 'android'), hostEnv);
        profile.app = path.join(host, 'android/app/build/outputs/apk/release/app-release.apk');
        run(`${label}-alignment`, process.env.ZIPALIGN ?? 'zipalign', ['-c', '-P', '16', '-v', '4', profile.app], host, hostEnv);
        run(`${label}-install-app`, 'adb', ['-s', android, 'install', '-r', profile.app], host, hostEnv);
      }
      if (platform === 'android') {
        // Background test apps can be frozen while their CDP sockets remain
        // discoverable. Stop only the other applications owned by this gate.
        for (const appId of new Set(profiles.map(item => item.appId))) {
          if (appId !== profile.appId) run(`${label}-stop-previous`, 'adb', ['-s', android, 'shell', 'am', 'force-stop', appId], host, hostEnv);
        }
      }
      const debug = path.join(evidence, `${label}-maestro`);
      rmSync(debug, { recursive: true, force: true });
      run(`${label}-flow`, 'maestro', ['--udid', platform === 'ios' ? ios : android, 'test', '-e', `APP_ID=${profile.appId}`, '--format', 'junit', '--output', path.join(evidence, `${label}.xml`), '--debug-output', debug, '--flatten-debug-output', featureFlow], host, hostEnv);
      const commands = JSON.parse(readFileSync(path.join(debug, 'commands-(feature-contract).json')))
        .sort((left, right) => left.metadata.sequenceNumber - right.metadata.sequenceNumber);
      const launch = commands.findIndex(item => item.command.launchAppCommand && !item.command.launchAppCommand.clearState);
      assert(launch >= 0 && commands[launch].metadata.status === 'COMPLETED', 'A new process must reopen the saved notebook');
      const ready = commands[launch + 1];
      assert.equal(ready.command.assertConditionCommand?.condition?.visible?.textRegex, 'Your library');
      assert.equal(ready.metadata.status, 'COMPLETED');
      const abandonment = [];
      if (changedRust) {
        const pendingDebug = path.join(evidence, `${label}-pending-maestro`);
        rmSync(pendingDebug, { recursive: true, force: true });
        run(`${label}-pending-flow`, 'maestro', ['--udid', platform === 'ios' ? ios : android, 'test', '-e', `APP_ID=${profile.appId}`, '--format', 'junit', '--output', path.join(evidence, `${label}-pending.xml`), '--debug-output', pendingDebug, '--flatten-debug-output', pendingFlow], host, hostEnv);
        const pendingCommands = JSON.parse(readFileSync(path.join(pendingDebug, 'commands-(feature-pending-contract).json')))
          .sort((left, right) => left.metadata.sequenceNumber - right.metadata.sequenceNumber);
        // Each pending-search assertion is followed by navigation back to the idle library.
        for (let index = 0; index < pendingCommands.length; index++) {
          if (pendingCommands[index].command.assertConditionCommand?.condition?.visible?.textRegex !== 'Searching…') continue;
          const end = pendingCommands.findIndex((item, next) => next > index && item.command.assertConditionCommand?.condition?.visible?.textRegex === 'Notes stay on this device.');
          assert(end > index, 'Every delayed request must be abandoned into an idle library');
          const start = pendingCommands[index - 1];
          assert(['Search library', 'Search'].includes(start.command.tapOnElement?.selector?.textRegex));
          const elapsedMs = pendingCommands[end].metadata.timestamp + pendingCommands[end].metadata.duration - start.metadata.timestamp;
          assert(elapsedMs < 18000, `Navigation took ${elapsedMs}ms during a 20-second Rust search`);
          abandonment.push({ elapsedMs, injectedSearchDelayMs: 20000 });
        }
        assert.equal(abandonment.length, 2, 'Exercise native request cancellation and embedded-view teardown');
      }
      const bytes = Number(run(`${label}-size`, 'du', ['-sk', profile.app], host, hostEnv).trim().split(/\s/)[0]) * 1024;
      results.push({ host: profile.name, platform, appId: profile.appId, passed: true,
        packageSha256: sha256(readFileSync(packages[profile.sdk])), manifestSha256: sha256(readFileSync(path.join(received, 'manifest.json'))),
        distributionDiskBytes: bytes, buildMs: timings[`${label}-build`],
        observedRelaunchToReadyMs: commands[launch].metadata.duration + ready.metadata.duration,
        abandonment,
        startupMeasurement: 'Maestro launch command plus first library assertion; includes automation/settling overhead, not a first-frame benchmark',
      });
    } catch (error) {
      results.push({ host: profile.name, platform, appId: profile.appId, passed: false, error: error.message });
      console.error(`FAIL: ${label}; continuing the other independent consumers. ${error.message}`);
    }
  }
}
const passed = results.length === 6 && results.every(result => result.passed);
writeFileSync(path.join(evidence, 'native-report.json'), JSON.stringify({ passed, changedRust, producerDeleted: true, hostBuildsWithoutRust: true,
  independentlyInstalledPackages: true, templates: 'Disposable independent RN/Expo/Lynx integration scaffolds; build caches may be warm',
  androidWebViewInspection: 'Maestro CDP; WebView debugging enabled only in disposable test applications, not SDKs or producer artifacts',
  iosSimulator: ios, androidEmulator: android, results, timings,
}, null, 2) + '\n');
assert(passed, `Failed consumers: ${results.filter(result => !result.passed).map(result => `${result.host}-${result.platform}`).join(', ')}. See ${evidence}/native-report.json`);
console.log(`PASS: six installed artifact-only document consumers. Evidence: ${evidence}/native-report.json`);
