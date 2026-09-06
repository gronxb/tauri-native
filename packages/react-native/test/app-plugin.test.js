'use strict';

const assert = require('node:assert/strict');
const { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const withTauriNative = require('../app.plugin.js');
const { readArtifacts } = require('../artifacts.js');

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function write(root, file, content) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); }

async function exported(directory, platform, label = 'version one', legacy = false) {
  // The real CLI writer supplies receipts to this independent host reader.
  const { ANDROID_ABIS, IOS_LAYOUT, writeArtifactManifest } = await import('../../cli/src/artifacts/manifest.ts');
  rmSync(directory, { recursive: true, force: true });
  const source = { rustEntrySha256: '0'.repeat(64) };
  const header = legacy ? 'void tauri_native_string_free(char *value);\n' : '#define TAURI_NATIVE_ABI_VERSION 1\n';
  let metadata;
  if (platform === 'ios') {
    const native = [
      { path: 'TauriNativeCore.xcframework/ios-arm64/core.a', architectures: ['arm64'], variant: 'device' },
      { path: 'TauriNativeCore.xcframework/ios-arm64_x86_64-simulator/core.a', architectures: ['arm64', 'x86_64'], variant: 'simulator' },
    ];
    for (const slice of native) {
      write(directory, slice.path, `${label} ${slice.variant}`);
      write(directory, path.posix.join(path.posix.dirname(slice.path), 'Headers/tauri_native.h'), header);
    }
    write(directory, 'TauriNativeCore.xcframework/Info.plist', 'fixture framework metadata');
    write(directory, 'TauriNativeAssets.bundle/index.html', label);
    write(directory, 'TauriNativeGenerated.podspec', 'fixture local pod');
    metadata = { ...IOS_LAYOUT, native, source };
  } else {
    const native = ANDROID_ABIS.map(abi => ({ abi, path: `jniLibs/${abi}/libtauri_native_core.so` }));
    for (const slice of native) write(directory, slice.path, `${label} ${slice.abi}`);
    write(directory, 'assets/tauri-native/index.html', label);
    if (!legacy) write(directory, 'include/tauri_native.h', header);
    metadata = { platform, minimumApiLevel: 24, pageSize: 16384, native, assets: 'assets/tauri-native', integration: null, header: legacy ? null : 'include/tauri_native.h', source };
  }
  writeArtifactManifest(directory, metadata, legacy ? undefined : { schemaVersion: 1, abiVersion: 1, commands: [] });
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'tauri-native-expo-')); roots.push(root);
  const projectRoot = path.join(root, 'Independent Host'); const producer = path.join(root, 'producer');
  for (const platform of ['ios', 'android']) await exported(path.join(producer, platform), platform);
  cpSync(producer, path.join(projectRoot, 'artifacts'), { recursive: true });
  rmSync(producer, { recursive: true }); assert.equal(existsSync(producer), false);
  write(projectRoot, 'package.json', '{"private":true}');
  write(projectRoot, 'ios/Podfile', "platform :ios, '16.4'\n\ntarget 'Fixture' do\n  pod 'HostPod'\nend\n");
  write(projectRoot, 'ios/Host.podspec', 'host pod');
  write(projectRoot, 'android/app/src/main/jniLibs/arm64-v8a/libhost.so', 'host library');
  write(projectRoot, 'android/app/src/main/assets/host/config.json', '{}');
  write(projectRoot, 'node_modules/expo/config-plugins/index.js', 'exports.withDangerousMod = (config, [platform, action]) => { config.actions = { ...config.actions, [platform]: action }; return config; };');
  const run = (platform, options = { artifactsDir: './artifacts' }) => {
    const config = withTauriNative({ _internal: { projectRoot } }, options);
    config.actions[platform]({ ...config, modRequest: { projectRoot, platformProjectRoot: path.join(projectRoot, platform) } });
  };
  const { inventory } = await import('../../cli/src/artifacts/files.ts');
  return { root, projectRoot, run, snapshot: platform => inventory(path.join(projectRoot, platform)), artifact: platform => path.join(projectRoot, 'artifacts', platform) };
}

test('two prebuilds and an upgrade use copied artifacts and preserve unrelated host files', async () => {
  const f = await fixture();
  for (const platform of ['ios', 'android']) {
    f.run(platform); const before = f.snapshot(platform); f.run(platform); assert.deepEqual(f.snapshot(platform), before);
    await exported(f.artifact(platform), platform, 'version two'); f.run(platform);
  }
  const read = file => readFileSync(path.join(f.projectRoot, file), 'utf8');
  assert.equal(read('ios/tauri-native/TauriNativeAssets.bundle/index.html'), 'version two');
  assert.equal(read('android/app/src/main/assets/tauri-native/index.html'), 'version two');
  assert.equal(read('android/app/src/main/jniLibs/arm64-v8a/libtauri_native_core.so'), 'version two arm64-v8a');
  assert.equal(read('ios/Host.podspec'), 'host pod');
  assert.equal(read('android/app/src/main/jniLibs/arm64-v8a/libhost.so'), 'host library');
  assert.equal(read('android/app/src/main/assets/host/config.json'), '{}');
  assert.equal(read('ios/Podfile').match(/pod 'TauriNativeGenerated'/g).length, 1);
  assert.match(read('ios/Podfile'), /pod 'HostPod'/);
});

test('corrupt, missing, incompatible and wrong-platform input cannot change an integrated host', async () => {
  const f = await fixture();
  for (const platform of ['ios', 'android']) {
    f.run(platform); const before = f.snapshot(platform); const source = f.artifact(platform);
    for (const damage of ['frontend', 'missing', 'abi', 'platform', 'format']) {
      await exported(source, platform, 'upgrade');
      const file = path.join(source, 'manifest.json'); const manifest = JSON.parse(readFileSync(file));
      if (damage === 'frontend') write(source, `${manifest.assets}/index.html`, 'damaged');
      else if (damage === 'missing') rmSync(path.join(source, manifest.native[0].path));
      else { manifest[damage === 'abi' ? 'abiVersion' : damage === 'format' ? 'formatVersion' : 'platform'] = damage === 'platform' ? 'other' : 99; writeFileSync(file, JSON.stringify(manifest)); }
      assert.throws(() => f.run(platform), /Invalid .* artifacts/); assert.deepEqual(f.snapshot(platform), before);
    }
  }
});

test('an invalid Podfile fails before copying valid iOS artifacts', async () => {
  const f = await fixture(); f.run('ios'); write(f.projectRoot, 'ios/Podfile', 'A host file without a target');
  const before = f.snapshot('ios'); await exported(f.artifact('ios'), 'ios', 'upgrade');
  assert.throws(() => f.run('ios'), /Could not find an iOS target/); assert.deepEqual(f.snapshot('ios'), before);
});

test('bare consumers validate copies without Expo or producer tools and reject links', async () => {
  const f = await fixture(); rmSync(path.join(f.projectRoot, 'node_modules'), { recursive: true });
  for (const platform of ['ios', 'android']) assert.equal(readArtifacts(f.artifact(platform), platform).platform, platform);
  const manifest = path.join(f.artifact('ios'), 'manifest.json'); const saved = path.join(f.root, 'saved-manifest.json');
  cpSync(manifest, saved); rmSync(manifest); symlinkSync(saved, manifest);
  assert.throws(() => readArtifacts(f.artifact('ios'), 'ios'), /must not be links/);
});

test('legacy convenience paths resolve the same reader without reading Tauri source', async () => {
  const f = await fixture(); const legacy = path.join(f.projectRoot, 'legacy/gen/tauri-native');
  for (const platform of ['ios', 'android']) {
    await exported(path.join(legacy, platform), platform, 'legacy output', true); f.run(platform, { tauriDir: './legacy' });
  }
  assert.equal(existsSync(path.join(f.projectRoot, 'legacy/Cargo.toml')), false);
  assert.equal(readFileSync(path.join(f.projectRoot, 'ios/tauri-native/TauriNativeAssets.bundle/index.html'), 'utf8'), 'legacy output');
});

test('missing or ambiguous configuration is diagnosed before host edits', async () => {
  const f = await fixture(); const before = f.snapshot('ios');
  assert.throws(() => f.run('ios', {}), /Set "artifactsDir"/);
  assert.throws(() => f.run('ios', { artifactsDir: './artifacts', tauriDir: './legacy' }), /not both/);
  assert.deepEqual(f.snapshot('ios'), before);
});
