import type { ConfigPlugin } from 'expo/config-plugins';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import { fail, plist } from './retained-expo-template.cts';

export type Platform = 'ios' | 'android';
export type RetainedExpoOptions = { runtime: 'retained'; artifactsDir: string; bundleFiles: Partial<Record<Platform, string>> };
export function expoTools(root: string) {
  const local = createRequire(path.join(root, 'package.json'));
  const expo = createRequire(realpathSync(local.resolve('expo/package.json')));
  const pins = { expo: '57.0.19', '@expo/cli': '57.0.21', '@expo/config': '57.0.9', '@expo/config-plugins': '57.0.9', '@expo/prebuild-config': '57.0.15' };
  for (const [name, version] of Object.entries(pins)) if (JSON.parse(readFileSync(expo.resolve(`${name}/package.json`), 'utf8')).version !== version) fail(`requires ${name} ${version}`);
  return { local, expo, cli: createRequire(expo.resolve('@expo/cli/package.json')), plugins: expo('expo/config-plugins') as typeof import('expo/config-plugins') };
}
export function retainedInput(root: string, options: RetainedExpoOptions, platform: Platform) {
  if (options.runtime !== 'retained' || typeof options.artifactsDir !== 'string' || !options.artifactsDir.trim() ||
      !options.bundleFiles || Object.keys(options).some(k => !['runtime', 'artifactsDir', 'bundleFiles'].includes(k)) ||
      Object.keys(options.bundleFiles).some(k => k !== 'ios' && k !== 'android')) fail('set runtime: retained, artifactsDir and per-platform bundleFiles in the config plugin');
  const bundle = options.bundleFiles[platform];
  if (typeof bundle !== 'string' || !bundle.trim()) fail(`set bundleFiles.${platform} to an offline main AppRegistry bundle`);
  const artifact = realpathSync(path.resolve(root, options.artifactsDir, platform));
  const manifest = readRetainedArtifacts(artifact);
  if (manifest.platform !== platform) fail(`requires the ${platform} retained artifact`);
  return { artifact, manifest, bundle: realpathSync(path.resolve(root, bundle)) };
}
function schemes(value: unknown): string[] {
  if (value === undefined) return [];
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || list.some(v => typeof v !== 'string' || !/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(v))) fail('URL schemes must be explicit valid scheme names');
  return list;
}

/** Defaults are read from immutable exports before Expo applies its ordinary config plugins. */
export const withRetainedExpo: ConfigPlugin<RetainedExpoOptions> = (config, options) => {
  if (!options?.bundleFiles || !Object.keys(options.bundleFiles).length || Object.keys(options.bundleFiles).some(k => k !== 'ios' && k !== 'android')) fail('declare at least one ios or android bundleFiles entry for the retained config plugin');
  const root = config._internal?.projectRoot ?? process.cwd();
  const { plugins } = expoTools(root);
  if ('jsEngine' in config && config.jsEngine !== 'hermes') fail('the retained Expo host requires Hermes');
  const selected = process.env.TAURI_NATIVE_EXPO_PLATFORM;
  for (const platform of ['ios', 'android'] as const) {
    if (selected && selected !== platform || !options.bundleFiles?.[platform]) continue;
    const { artifact, manifest } = retainedInput(root, options, platform);
    const appId = manifest.bootstrap.applicationId;
    if (platform === 'android') {
      if (config.android?.package && config.android.package !== appId) fail('android.package conflicts with the original Tauri application');
      if (config.android?.googleServicesFile || config.android?.versionCode !== undefined) fail('Google Services and versionCode require verified Kotlin Gradle integration');
      config.android = { ...config.android, package: appId };
    } else {
      if (manifest.platform !== 'ios') fail('requires iOS bootstrap metadata');
      if (config.ios?.bundleIdentifier && config.ios.bundleIdentifier !== appId) fail('ios.bundleIdentifier conflicts with the original Tauri application');
      const project = plist(path.join(artifact, 'ios', manifest.bootstrap.xcodeProject, 'project.pbxproj'));
      const tablet = Object.values(project.objects).some((o: any) => String(o.buildSettings?.TARGETED_DEVICE_FAMILY).split(',').includes('2'));
      const infoFiles = [...new Set<string>(Object.values(project.objects).map((o: any) => o.buildSettings?.INFOPLIST_FILE).filter(Boolean))];
      if (infoFiles.length !== 1) fail('CNG requires one original Info.plist');
      const original = plist(path.join(artifact, 'ios', infoFiles[0]!));
      const overrides = config.ios?.infoPlist ?? {};
      if (overrides.UIApplicationSceneManifest || overrides.UIApplicationDelegateClassName || overrides.CFBundleExecutable ||
          overrides.CFBundleIdentifier && overrides.CFBundleIdentifier !== original.CFBundleIdentifier) fail('Info.plist overrides conflict with the original Tauri startup/identity');
      const originalUrls = original.CFBundleURLTypes ?? [];
      const added = [...schemes(config.scheme), ...schemes(config.ios?.scheme)];
      const urls = [...originalUrls, ...(overrides.CFBundleURLTypes as unknown[] ?? [])];
      const existing = new Set(urls.flatMap((entry: any) => entry.CFBundleURLSchemes ?? []));
      const extra = [...new Set(added)].filter(scheme => !existing.has(scheme));
      if (extra.length) urls.push({ CFBundleURLSchemes: extra });
      const info: Record<string, any> = { ...original, ...overrides, ...(urls.length ? { CFBundleURLTypes: urls } : {}) };
      if (config.version) info.CFBundleShortVersionString = config.version;
      if (config.ios?.buildNumber) info.CFBundleVersion = config.ios.buildNumber;
      const catalog = path.join(artifact, 'ios/Assets.xcassets/AppIcon.appiconset');
      const contents = JSON.parse(readFileSync(path.join(catalog, 'Contents.json'), 'utf8'));
      const icon = contents.images.find((entry: any) => entry.idiom === 'ios-marketing' && entry.size === '1024x1024' && entry.scale === '1x')?.filename;
      if (!config.icon && !config.ios?.icon && (typeof icon !== 'string' || path.basename(icon) !== icon)) fail('original Tauri app needs a 1024px marketing icon for Expo defaults');
      config.ios = { supportsTablet: tablet, ...config.ios, bundleIdentifier: appId, infoPlist: info, ...(!config.icon && !config.ios?.icon ? { icon: path.join(catalog, icon) } : {}) };
    }
    config = plugins.withDangerousMod(config, [platform, mod => {
      const receipt = path.join(mod.modRequest.platformProjectRoot, 'tauri-native-composition.json');
      let value;
      try { value = JSON.parse(readFileSync(receipt, 'utf8')); } catch { fail('run tauri-native-prebuild so Expo receives the retained Tauri template'); }
      if (value.cng !== 1 || value.renderer !== 'react-native' || value.layout !== 'native-project') fail('run tauri-native-prebuild with an owned retained Tauri template');
      return mod;
    }]);
  }
  return config;
};
