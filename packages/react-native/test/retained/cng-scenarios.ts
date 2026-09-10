import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

export const cngPurpose = 'Attach a location through retained CNG.';
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function snapshot(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const file = path.posix.join(prefix, e.name);
    return e.isDirectory() ? Object.entries(snapshot(root, file)) : [[file, e.isSymbolicLink() ? `symlink:${readlinkSync(path.join(root, file))}` : sha(readFileSync(path.join(root, file)))]];
  }));
}
export function configureCng(renderer: string, artifact: string, platform: 'ios' | 'android', bundle: string) {
  const exports = path.join(renderer, 'retained-exports'); mkdirSync(exports, { recursive: true });
  cpSync(artifact, path.join(exports, platform), { recursive: true });
  const file = path.join(renderer, 'app.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  config.expo.scheme = 'consumer-added';
  config.expo.plugins = [
    ['@tauri-native/react-native', { runtime: 'retained', artifactsDir: './retained-exports', bundleFiles: { [platform]: path.relative(renderer, bundle) } }],
    ['expo-location', { locationWhenInUsePermission: cngPurpose }], './with-cng-proof.cjs',
  ];
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  writeFileSync(path.join(renderer, 'with-cng-proof.cjs'), `const { withInfoPlist, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');
module.exports = config => withAndroidManifest(withInfoPlist(config, mod => { mod.modResults.TauriNativeCNGProbe = 'actual config plugin'; return mod; }), mod => {
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults), 'dev.taurinative.CNG_PROBE', 'actual config plugin'); return mod;
});\n`);
}

/** Actual Expo CLI scenarios against the consumer's installed public SDK; no native-execution claim here. */
export async function verifyCng(renderer: string, platform: 'ios' | 'android', log: (label: string, content: string) => void) {
  const local = createRequire(path.join(renderer, 'package.json'));
  const { prebuildRetainedExpo } = local('@tauri-native/react-native/prebuild');
  const project = path.join(renderer, platform), configFile = path.join(renderer, 'app.json');
  const configBytes = readFileSync(configFile), config = JSON.parse(configBytes.toString());
  const input = config.expo.plugins[0][1], artifact = path.resolve(renderer, input.artifactsDir, platform);
  const originalArtifact = snapshot(artifact);
  const bundle = path.resolve(renderer, input.bundleFiles[platform]), originalBundle = readFileSync(bundle);
  const run = async (label: string, clean = false) => {
    const result = await prebuildRetainedExpo({ projectRoot: renderer, platform, clean });
    log(label, result.log); return result;
  };
  const first = await run('cng-first');
  const firstFiles = snapshot(project);
  await run('cng-repeat'); assert.deepEqual(snapshot(project), firstFiles, 'Normal generation must be repeatable');
  await run('cng-clean', true); assert.deepEqual(snapshot(project), firstFiles, 'Clean generation must be repeatable');
  assert.deepEqual(snapshot(artifact), originalArtifact);
  const metadata = () => platform === 'ios' ? JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(project, first.infoFile)], { encoding: 'utf8' })) : readFileSync(path.join(project, 'app/src/main/AndroidManifest.xml'), 'utf8');
  if (platform === 'ios') {
    const info = metadata();
    assert.equal(info.NSLocationWhenInUseUsageDescription, cngPurpose); assert.equal(info.TauriNativeCNGProbe, 'actual config plugin');
    for (const scheme of ['tauri-fieldnotes', 'consumer-added']) assert(info.CFBundleURLTypes.some((entry: any) => entry.CFBundleURLSchemes.includes(scheme)));
  } else {
    assert.match(metadata(), /android:scheme="tauri-fieldnotes"/); assert.match(metadata(), /android:scheme="consumer-added"/);
    assert.match(metadata(), /android:name="dev.taurinative.CNG_PROBE" android:value="actual config plugin"/);
  }
  const unowned = path.join(project, 'consumer-note.txt'); writeFileSync(unowned, 'Keep this consumer file.');
  writeFileSync(bundle, Buffer.concat([originalBundle, Buffer.from('\n// CNG bundle upgrade\n')]));
  await run('cng-bundle-upgrade');
  const nativeBundle = path.join(project, platform === 'ios' ? 'assets/tauri-native-react/index.bundle.js' : 'app/src/main/assets/tauri-native-react/index.bundle.js');
  assert.equal(sha(readFileSync(nativeBundle)), sha(readFileSync(bundle))); assert.equal(readFileSync(unowned, 'utf8'), 'Keep this consumer file.');
  writeFileSync(bundle, originalBundle);
  await run('cng-bundle-restore');
  const header = path.join(renderer, 'consumer-header.h'), links = path.join(project, 'Pods/Headers/Private/Consumer');
  writeFileSync(header, 'consumer header'); mkdirSync(links, { recursive: true });
  const relative = path.relative(links, header);
  symlinkSync(relative, path.join(links, 'Consumer.h')); symlinkSync('./missing.h', path.join(links, 'Missing.h'));
  await run('cng-pod-links');
  assert.equal(readlinkSync(path.join(links, 'Consumer.h')), relative); assert.equal(readFileSync(path.join(links, 'Consumer.h'), 'utf8'), 'consumer header');
  assert.equal(readlinkSync(path.join(links, 'Missing.h')), './missing.h');
  await run('cng-clean-pod-links', true); assert(!existsSync(path.join(project, 'Pods'))); rmSync(header);
  const owner = path.join(project, platform === 'ios' ? first.main : 'app/src/main/java/dev/taurinative/mobilefieldnotes/MainActivity.kt');
  const originalOwner = readFileSync(owner); writeFileSync(owner, '// consumer source edit\n');
  const edited = snapshot(project);
  await assert.rejects(run('cng-edited-owner'), /generated file changed/); assert.deepEqual(snapshot(project), edited);
  writeFileSync(owner, originalOwner);
  const failurePlugin = path.join(renderer, 'with-cng-failure.cjs');
  config.expo.plugins.push('./with-cng-failure.cjs');
  writeFileSync(configFile, JSON.stringify(config));
  const failCases = [
    ['plugin-throws', `fs.writeFileSync(path.join(root, 'partial-plugin.txt'), 'partial output'); throw new Error('CNG injected plugin failure');`, /CNG injected plugin failure/],
    ['owner-replaced', `fs.writeFileSync(path.join(root, ${JSON.stringify(path.relative(project, owner))}), '// different native owner');`, /changed retained native owner\/input/],
    ['unowned-collision', "fs.writeFileSync(path.join(root, 'consumer-note.txt'), 'new generated file');", /conflicts with consumer file/],
  ] as const;
  for (const [name, code, expected] of failCases) {
    writeFileSync(failurePlugin, `const fs = require('node:fs'), path = require('node:path'), { withDangerousMod } = require('expo/config-plugins');
module.exports = config => withDangerousMod(config, [${JSON.stringify(platform)}, mod => { const root = mod.modRequest.platformProjectRoot; ${code} return mod; }]);\n`);
    const before = snapshot(project), packageBytes = readFileSync(path.join(renderer, 'package.json'));
    await assert.rejects(run(`cng-${name}`), expected);
    assert.deepEqual(snapshot(project), before, `${name} must restore the entire prior native project`);
    assert.deepEqual(readFileSync(path.join(renderer, 'package.json')), packageBytes); assert.deepEqual(snapshot(artifact), originalArtifact);
    assert(!existsSync(path.join(renderer, '.tauri-native-prebuild.lock')));
  }
  writeFileSync(failurePlugin, platform === 'ios'
    ? "const {withInfoPlist}=require('expo/config-plugins'); module.exports=c=>withInfoPlist(c,m=>{delete m.modResults.CFBundleURLTypes; return m;});\n"
    : "const {withAndroidManifest,AndroidConfig}=require('expo/config-plugins'); module.exports=c=>withAndroidManifest(c,m=>{AndroidConfig.Manifest.getMainActivityOrThrow(m.modResults)['intent-filter']=[]; return m;});\n");
  const registered = snapshot(project);
  await assert.rejects(run('cng-registration-removed'), /original (?:CFBundleURLTypes|Android intent registrations)/);
  assert.deepEqual(snapshot(project), registered, 'Removing original OS registrations must restore the previous consumer');
  writeFileSync(configFile, configBytes); rmSync(failurePlugin);
  const withoutPlugins = JSON.parse(configBytes.toString()); withoutPlugins.expo.plugins = withoutPlugins.expo.plugins.slice(0, 1);
  writeFileSync(configFile, JSON.stringify(withoutPlugins));
  await run('cng-plugin-removal', true);
  if (platform === 'ios') { assert.notEqual(metadata().NSLocationWhenInUseUsageDescription, cngPurpose); assert.equal(metadata().TauriNativeCNGProbe, undefined); }
  else assert.doesNotMatch(metadata(), /dev.taurinative.CNG_PROBE/);
  writeFileSync(configFile, configBytes); rmSync(unowned);
  const result = await run('cng-final', true);
  assert.deepEqual(snapshot(project), firstFiles); assert.deepEqual(snapshot(artifact), originalArtifact); assert.deepEqual(readFileSync(bundle), originalBundle);
  return { ...result, generationScenarios: ['normal and clean repeat generation', 'original and consumer URL schemes', 'real location/custom config plugins', 'bundle upgrade with user file preservation', 'relative and dangling CocoaPods links preserved during normal regeneration', 'edited native source rejection', 'plugin failure rollback', 'native owner conflict rollback', 'unowned file conflict rollback', 'original OS registration removal rejected', 'config plugin removal and restoration'], files: snapshot(project) };
}
