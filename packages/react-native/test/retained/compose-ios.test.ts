import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
import type { IosCompositionOptions } from '../../plugin/retained-compose-types.d.cts';

// Run with the iOS native gate on macOS; these are metadata scenarios, not native execution claims.
const { composeIos } = createRequire(import.meta.url)('../../compose.js') as { composeIos: (options: IosCompositionOptions) => { changed: boolean; minimumOsVersion: string } };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function write(root: string, file: string, content: string) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content); }
function snapshot(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? Object.entries(snapshot(root, file)) : [[file, sha(readFileSync(path.join(root, file)))]];
  }));
}
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "retained iOS '$#{config} ")); roots.push(root);
  const artifact = path.join(root, 'artifact'), renderer = path.join(root, 'renderer');
  const settings = { INFOPLIST_FILE: 'App/Info.plist', IPHONEOS_DEPLOYMENT_TARGET: '15.0', CUSTOM_SETTING: 'preserve' };
  const project = { rootObject: 'project', objects: {
    project: { isa: 'PBXProject', mainGroup: 'root' }, root: { isa: 'PBXGroup', children: [] },
    app: { isa: 'PBXNativeTarget', name: 'App', productType: 'com.apple.product-type.application', buildPhases: ['sources', 'resources'], buildConfigurationList: 'configurations' },
    configurations: { isa: 'XCConfigurationList', buildConfigurations: ['debug', 'release'] },
    debug: { isa: 'XCBuildConfiguration', name: 'debug', buildSettings: { ...settings } }, release: { isa: 'XCBuildConfiguration', name: 'release', buildSettings: { ...settings } },
    sources: { isa: 'PBXSourcesBuildPhase', files: ['mainBuild', 'clientBuild'] }, resources: { isa: 'PBXResourcesBuildPhase', files: ['assetBuild'] },
    mainBuild: { isa: 'PBXBuildFile', fileRef: 'main' }, clientBuild: { isa: 'PBXBuildFile', fileRef: 'client' }, assetBuild: { isa: 'PBXBuildFile', fileRef: 'assets' },
    main: { isa: 'PBXFileReference', path: 'Sources/App/main.mm', sourceTree: 'SOURCE_ROOT' }, client: { isa: 'PBXFileReference', path: 'Sources/TauriNativeRuntime/TNRuntimeSession.mm', sourceTree: 'SOURCE_ROOT' }, assets: { isa: 'PBXFileReference', path: 'assets', sourceTree: 'SOURCE_ROOT' },
  } };
  const files = {
    'commands.json': JSON.stringify({ schemaVersion: 1, abiVersion: 3, commands: [] }), 'callers.json': JSON.stringify({ version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } }),
    'include/tauri_native_runtime.h': 'metadata fixture', 'ios/App.xcodeproj/project.pbxproj': JSON.stringify(project), 'ios/App/Info.plist': JSON.stringify({ CFBundleIdentifier: 'dev.tauri.fixture', NSLocationWhenInUseUsageDescription: 'Keep location purpose' }),
    'ios/Sources/App/main.mm': '#include "bindings/bindings.h"\nint main(int argc, char * argv[]) { ffi::start_app(); return 0; }\n',
    'ios/Sources/TauriNativeRuntime/TNRuntimeSession.mm': 'metadata client', 'ios/Sources/TauriNativeRuntime/TNRuntimeSession.h': 'metadata header', 'ios/Sources/TauriNativeRuntime/tauri_native_runtime.h': 'metadata ABI',
    'ios/TauriNativeRuntime.xcframework/Info.plist': '{}', 'ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a': 'not a real library: metadata tests only',
  };
  for (const [file, value] of Object.entries(files)) write(artifact, file, value);
  function receipt() {
    const files = Object.entries(snapshot(artifact)).filter(([file]) => file !== 'manifest.json').map(([file, sha256]) => ({ path: file, sha256, size: readFileSync(path.join(artifact, file)).length }));
    write(artifact, 'manifest.json', JSON.stringify({ formatVersion: 2, abiVersion: 3, platform: 'ios', profile: 'release', generator: { name: '@tauri-native/cli', version: 'test' },
      compatibility: { mode: 'retained', tauri: '2.11.5', tauriCli: '2.11.4', wry: '0.55.1', tauriRuntimeWry: '2.11.4' }, plugins: {}, commands: 'commands.json', callers: 'callers.json',
      source: { callerPolicySha256: sha(readFileSync(path.join(artifact, 'callers.json'))) }, bootstrap: { owner: 'tauri', project: 'ios', xcodeProject: 'App.xcodeproj', target: 'App', applicationId: 'dev.tauri.fixture', minimumOsVersion: '15.0' },
      native: [{ variant: 'simulator', architectures: ['arm64'], path: 'ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a' }], files }));
  }
  receipt();
  for (const name of ['react-native', '@react-native/codegen']) write(renderer, `node_modules/${name}/package.json`, JSON.stringify({ name, version: '0.86.3' }));
  write(renderer, 'package.json', '{"private":true}'); write(renderer, 'index.bundle.js', 'first renderer');
  const options = { artifactsDir: artifact, rendererDir: renderer, outputDir: path.join(root, 'generated app'), moduleName: 'Example', bundleFile: path.join(renderer, 'index.bundle.js') };
  return { root, artifact, renderer, options, project, receipt, run: () => composeIos(options) };
}
function plist(file: string) {
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}

test('iOS composition preserves its source and settings, applies RN minimum OS and regenerates without losing consumer files', () => {
  const f = fixture(), before = snapshot(f.artifact);
  assert.equal(f.run().minimumOsVersion, '16.4'); const first = snapshot(f.options.outputDir);
  assert.equal(f.run().changed, false); assert.deepEqual(snapshot(f.options.outputDir), first);
  const project = plist(path.join(f.options.outputDir, 'ios/App.xcodeproj/project.pbxproj'));
  assert.equal(project.objects.release.buildSettings.CUSTOM_SETTING, 'preserve');
  assert.equal(project.objects.release.buildSettings.IPHONEOS_DEPLOYMENT_TARGET, '16.4');
  assert.deepEqual(snapshot(f.artifact), before);
  assert.match(readFileSync(path.join(f.options.outputDir, 'ios/Sources/App/main.mm'), 'utf8'), /ffi::start_app\(\);/);
  const ruby = spawnSync('ruby', ['-c', path.join(f.options.outputDir, 'ios/Podfile')], { encoding: 'utf8' }); assert.equal(ruby.status, 0, ruby.stderr);
  write(f.options.outputDir, 'ios/consumer.txt', 'keep'); write(f.renderer, 'index.bundle.js', 'upgrade');
  assert.equal(f.run().changed, true);
  assert.equal(readFileSync(path.join(f.options.outputDir, 'ios/consumer.txt'), 'utf8'), 'keep');
  assert.equal(readFileSync(path.join(f.options.outputDir, 'ios/assets/tauri-native-react/index.bundle.js'), 'utf8'), 'upgrade');
});

test('a higher authored deployment target remains higher than the RN minimum', () => {
  const f = fixture(); f.project.objects.release.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '18.2';
  write(f.artifact, 'ios/App.xcodeproj/project.pbxproj', JSON.stringify(f.project)); f.receipt();
  assert.equal(f.run().minimumOsVersion, '18.2');
  const project = plist(path.join(f.options.outputDir, 'ios/App.xcodeproj/project.pbxproj'));
  assert.equal(project.objects.debug.buildSettings.IPHONEOS_DEPLOYMENT_TARGET, '18.2');
});

test('Expo identity and artifact-owned integration conflicts preserve the previous iOS consumer', () => {
  const f = fixture(); f.options.outputDir = path.join(f.renderer, 'native'); f.run();
  const before = snapshot(f.options.outputDir), source = snapshot(f.artifact);
  const example = createRequire(new URL('../../../../examples/react-native/package.json', import.meta.url));
  symlinkSync(path.dirname(realpathSync(example.resolve('expo/package.json'))), path.join(f.renderer, 'node_modules/expo'), 'dir');
  write(f.renderer, 'app.json', JSON.stringify({ expo: { name: 'Fixture', slug: 'retained-fixture', ios: { bundleIdentifier: 'dev.other.application' } } }));
  const options = { ...f.options, expo: true };
  assert.throws(() => composeIos(options), /ios.bundleIdentifier.*conflicts with the original Tauri/);
  assert.deepEqual(snapshot(f.options.outputDir), before); assert.deepEqual(snapshot(f.artifact), source);
  write(f.renderer, 'app.json', JSON.stringify({ expo: { name: 'Fixture', slug: 'retained-fixture', ios: { bundleIdentifier: 'dev.tauri.fixture' } } }));
  write(f.artifact, 'ios/tauri-native-autolinking.cjs', 'producer-owned script'); f.receipt();
  assert.throws(() => composeIos(options), /artifact already owns Expo autolinking script/);
  assert.deepEqual(snapshot(f.options.outputDir), before);
  assert.equal(readFileSync(path.join(f.artifact, 'ios/tauri-native-autolinking.cjs'), 'utf8'), 'producer-owned script');
});

test('a same-version Expo factory patch is rejected before replacing the previous consumer', () => {
  const f = fixture(); f.options.outputDir = path.join(f.renderer, 'native'); f.run();
  const before = snapshot(f.options.outputDir), source = snapshot(f.artifact);
  const example = createRequire(new URL('../../../../examples/react-native/package.json', import.meta.url));
  const expoRoot = path.dirname(realpathSync(example.resolve('expo/package.json')));
  const installed = path.join(f.renderer, 'node_modules/expo');
  write(installed, 'package.json', readFileSync(path.join(expoRoot, 'package.json'), 'utf8'));
  symlinkSync(path.dirname(expoRoot), path.join(installed, 'node_modules'), 'dir');
  write(installed, 'ios/AppDelegates/ExpoReactNativeFactory.swift', 'changed factory lifetime');
  assert.throws(() => composeIos({ ...f.options, expo: true }), /factory source changed/);
  assert.deepEqual(snapshot(f.options.outputDir), before);
  assert.deepEqual(snapshot(f.artifact), source);
});

test('corruption, existing pods, custom startup, scene ownership and edited generated projects preserve the previous consumer', () => {
  const f = fixture(); f.run(); const before = snapshot(f.options.outputDir);
  const original = path.join(f.root, 'saved'); cpSync(f.artifact, original, { recursive: true });
  for (const [file, value, expected] of [
    ['ios/TauriNativeRuntime.xcframework/ios-arm64-simulator/libapp.a', 'bad', /changed or unexpected/],
    ['ios/Podfile', "pod 'AnotherDelegate'", /existing CocoaPods/],
    ['ios/Sources/App/main.mm', 'int main() { return UIApplicationMain(); }', /custom iOS application entry/],
    ['ios/App/Info.plist', JSON.stringify({ UIApplicationSceneManifest: {} }), /scene\/delegate ownership/],
  ] as const) {
    rmSync(f.artifact, { recursive: true }); cpSync(original, f.artifact, { recursive: true }); write(f.artifact, file, value);
    if (!file.endsWith('.a')) f.receipt();
    assert.throws(f.run, expected); assert.deepEqual(snapshot(f.options.outputDir), before);
  }
  rmSync(f.artifact, { recursive: true }); cpSync(original, f.artifact, { recursive: true });
  write(f.options.outputDir, 'ios/App.xcodeproj/project.pbxproj', 'consumer edit');
  assert.throws(f.run, /generated file changed/);
  assert.equal(readFileSync(path.join(f.options.outputDir, 'ios/App.xcodeproj/project.pbxproj'), 'utf8'), 'consumer edit');
});

test('CocoaPods receipt tracking accepts its project rewrite but rejects existing or concurrent source edits', () => {
  const f = fixture(); f.run();
  const ios = path.join(f.options.outputDir, 'ios');
  const receipt = path.join(f.options.outputDir, 'tauri-native-composition.json');
  const main = path.join(ios, 'Sources/App/main.mm');
  const originalMain = readFileSync(main, 'utf8');
  const before = readFileSync(receipt, 'utf8');
  const run = (body: string) => spawnSync('ruby', ['-r', createRequire(import.meta.url).resolve('../../ios/retained/pods.rb'), '-e', body, ios], { encoding: 'utf8' });
  writeFileSync(main, 'existing consumer edit');
  let result = run('TauriNativeReactRetained.composition_receipt(ARGV[0])');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /composition file changed/);
  assert.equal(readFileSync(receipt, 'utf8'), before);
  writeFileSync(main, originalMain);
  result = run(`
    before = TauriNativeReactRetained.composition_receipt(ARGV[0])
    File.write(File.join(ARGV[0], 'Sources/App/main.mm'), 'concurrent consumer edit')
    TauriNativeReactRetained.finish_composition(ARGV[0], before)
  `);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /composition file changed/);
  assert.equal(readFileSync(receipt, 'utf8'), before);
  assert.equal(readFileSync(main, 'utf8'), 'concurrent consumer edit');
  writeFileSync(main, originalMain);
  result = run(`
    before = TauriNativeReactRetained.composition_receipt(ARGV[0])
    File.open(File.join(ARGV[0], 'App.xcodeproj/project.pbxproj'), 'a') { |file| file.write("\\n") }
    TauriNativeReactRetained.finish_composition(ARGV[0], before)
    TauriNativeReactRetained.composition_receipt(ARGV[0])
  `);
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(readFileSync(receipt, 'utf8'));
  assert.equal(after.files['ios/App.xcodeproj/project.pbxproj'], sha(readFileSync(path.join(ios, 'App.xcodeproj/project.pbxproj'))));
  assert.equal(after.files['ios/Sources/App/main.mm'], JSON.parse(before).files['ios/Sources/App/main.mm']);
  assert.equal(f.run().changed, true);
});
