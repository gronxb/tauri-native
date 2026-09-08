import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { createRequire } from 'node:module';
type ModConfig = { _internal: { projectRoot: string }; modRequest?: { projectRoot: string; platformProjectRoot: string } };
const withTauriNative = createRequire(import.meta.url)('../app.plugin.js') as (config: ModConfig, options: { artifactsDir?: string; tauriDir?: string }) => ModConfig & { actions: Record<'ios' | 'android', (config: ModConfig) => ModConfig> };
import { readArtifacts } from '../artifacts.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function write(root: string, file: string, content: string) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); }

async function exported(...args: Parameters<typeof import('../../../scripts/test-artifacts.ts').writeTestArtifacts>) {
  const { writeTestArtifacts } = await import('../../../scripts/test-artifacts.ts');
  return writeTestArtifacts(...args);
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'tauri-native-expo-')); roots.push(root);
  const projectRoot = path.join(root, 'Independent Host'); const producer = path.join(root, 'producer');
  for (const platform of ['ios', 'android'] as const) await exported(path.join(producer, platform), platform);
  cpSync(producer, path.join(projectRoot, 'artifacts'), { recursive: true });
  rmSync(producer, { recursive: true }); assert.equal(existsSync(producer), false);
  write(projectRoot, 'package.json', '{"private":true}');
  write(projectRoot, 'ios/Podfile', "platform :ios, '16.4'\n\ntarget 'Fixture' do\n  pod 'HostPod'\nend\n");
  write(projectRoot, 'ios/Host.podspec', 'host pod');
  write(projectRoot, 'android/app/src/main/jniLibs/arm64-v8a/libhost.so', 'host library');
  write(projectRoot, 'android/app/src/main/assets/host/config.json', '{}');
  write(projectRoot, 'node_modules/expo/config-plugins/index.js', 'exports.withDangerousMod = (config, [platform, action]) => { config.actions = { ...config.actions, [platform]: action }; return config; };');
  const run = (platform: 'ios' | 'android', options: { artifactsDir?: string; tauriDir?: string } = { artifactsDir: './artifacts' }) => {
    const config = withTauriNative({ _internal: { projectRoot } }, options);
    config.actions[platform]({ ...config, modRequest: { projectRoot, platformProjectRoot: path.join(projectRoot, platform) } });
  };
  const { inventory } = await import('../../cli/src/artifacts/files.ts');
  return { root, projectRoot, run, snapshot: (platform: string) => inventory(path.join(projectRoot, platform)), artifact: (platform: string) => path.join(projectRoot, 'artifacts', platform) };
}

test('two prebuilds and an upgrade use copied artifacts and preserve unrelated host files', async () => {
  const f = await fixture();
  for (const platform of ['ios', 'android'] as const) {
    f.run(platform); const before = f.snapshot(platform); f.run(platform); assert.deepEqual(f.snapshot(platform), before);
    await exported(f.artifact(platform), platform, 'version two'); f.run(platform);
  }
  const read = (file: string) => readFileSync(path.join(f.projectRoot, file), 'utf8');
  assert.equal(read('ios/tauri-native/TauriNativeAssets.bundle/index.html'), 'version two');
  assert.equal(read('android/app/src/main/assets/tauri-native/index.html'), 'version two');
  assert.equal(read('android/app/src/main/jniLibs/arm64-v8a/libtauri_native_core.so'), 'version two arm64-v8a');
  assert.equal(read('ios/Host.podspec'), 'host pod');
  assert.equal(read('android/app/src/main/jniLibs/arm64-v8a/libhost.so'), 'host library');
  assert.equal(read('android/app/src/main/assets/host/config.json'), '{}');
  assert.equal(read('ios/Podfile').match(/pod 'TauriNativeGenerated'/g)!.length, 1);
  assert.match(read('ios/Podfile'), /pod 'HostPod'/);
});

test('corrupt, missing, incompatible and wrong-platform input cannot change an integrated host', async () => {
  const f = await fixture();
  for (const platform of ['ios', 'android'] as const) {
    f.run(platform); const before = f.snapshot(platform); const source = f.artifact(platform);
    for (const damage of ['frontend', 'missing', 'abi', 'platform', 'format'] as const) {
      await exported(source, platform, 'upgrade');
      const file = path.join(source, 'manifest.json'); const manifest = JSON.parse(readFileSync(file, 'utf8'));
      if (damage === 'frontend') write(source, `${manifest.assets}/index.html`, 'damaged');
      else if (damage === 'missing') rmSync(path.join(source, manifest.native[0].path));
      else { manifest[damage === 'abi' ? 'abiVersion' : damage === 'format' ? 'formatVersion' : 'platform'] = damage === 'platform' ? 'other' : 99; writeFileSync(file, JSON.stringify(manifest)); }
      const code = { frontend: 'artifact_checksum', missing: 'artifact_missing_file', abi: 'artifact_abi', platform: 'artifact_platform', format: 'artifact_format' }[damage];
      assert.throws(() => f.run(platform), { code, message: /Invalid .* artifacts/ }); assert.deepEqual(f.snapshot(platform), before);
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
  for (const platform of ['ios', 'android'] as const) assert.equal(readArtifacts(f.artifact(platform), platform).platform, platform);
  const manifest = path.join(f.artifact('ios'), 'manifest.json'); const saved = path.join(f.root, 'saved-manifest.json');
  cpSync(manifest, saved); rmSync(manifest); symlinkSync(saved, manifest);
  assert.throws(() => readArtifacts(f.artifact('ios'), 'ios'), /must not be links/);
});

test('legacy convenience paths resolve the same reader without reading Tauri source', async () => {
  const f = await fixture(); const legacy = path.join(f.projectRoot, 'legacy/gen/tauri-native');
  for (const platform of ['ios', 'android'] as const) {
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
