import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ruby = (s: string) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export function prepareExpoIos(context: { rendererDirectory: string; output: string; manifest: { bootstrap: { applicationId: string } } }) {
  const { rendererDirectory: renderer, output, manifest } = context;
  if (!output.startsWith(renderer + path.sep)) throw new Error('Retained Expo composition: outputDir must be inside rendererDir so Expo scripts resolve the consuming app');
  const requireRenderer = createRequire(path.join(renderer, 'package.json'));
  const expo = realpathSync(requireRenderer.resolve('expo/package.json'));
  const requireExpo = createRequire(expo);
  for (const [name, version] of Object.entries({ expo: '57.0.19', 'expo-modules-core': '57.0.15', 'expo-modules-autolinking': '57.0.12', 'expo-constants': '57.0.17' })) {
    const file = name === 'expo' ? expo : requireExpo.resolve(`${name}/package.json`);
    if (JSON.parse(readFileSync(file, 'utf8')).version !== version) throw new Error(`Retained Expo composition: requires ${name} ${version}`);
  }
  const factory = readFileSync(path.join(path.dirname(expo), 'ios/AppDelegates/ExpoReactNativeFactory.swift'));
  if (createHash('sha256').update(factory).digest('hex') !== 'fff6c0bd8c132272675db99583e1cc990dc776820e12a60dfd4809337f7f6529') {
    throw new Error('Retained Expo composition: factory source changed; verify its renderer teardown before composing');
  }
  const { getConfig } = requireExpo('@expo/config') as { getConfig(root: string, options: { skipPlugins: boolean }): { exp: { ios?: { bundleIdentifier?: string } } } };
  const id = getConfig(renderer, { skipPlugins: true }).exp.ios?.bundleIdentifier;
  if (id && id !== manifest.bootstrap.applicationId) throw new Error(`Retained Expo composition: ios.bundleIdentifier ${id} conflicts with the original Tauri application ${manifest.bootstrap.applicationId}`);
  const relative = (dir: string) => ruby(path.relative(path.join(output, 'ios'), dir).split(path.sep).join('/'));
  const expoRoot = path.dirname(expo);
  const constants = path.dirname(requireExpo.resolve('expo-constants/package.json'));
  return {
    setup: `ENV['TAURI_NATIVE_EXPO'] = '1'\nrequire File.expand_path(${relative(path.join(expoRoot, 'scripts/autolinking.rb'))}, __dir__)\n`,
    target: `  use_expo_modules!(:appRoot => File.expand_path(${relative(renderer)}, __dir__), :projectRoot => File.expand_path(${relative(renderer)}, __dir__), :exclude => ['@tauri-native/react-native'])\n  use_native_modules!([${ruby(process.execPath)}, File.join(__dir__, 'tauri-native-autolinking.cjs')])\n`,
    postInstall: `, expo: { root: File.expand_path(${relative(renderer)}, __dir__), node: ${ruby(process.execPath)}, constants: File.expand_path(${relative(constants)}, __dir__) }`,
    autolinking: `const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, ${JSON.stringify(path.relative(path.join(output, 'ios'), renderer))});
const local = createRequire(path.join(root, 'package.json'));
const config = JSON.parse(execFileSync(process.execPath, [local.resolve('expo/bin/autolinking'), 'react-native-config', '--json', '--platform', 'ios', '--project-root', root, '--exclude', '@tauri-native/react-native'], { cwd: root, encoding: 'utf8' }));
// RN codegen also reads this output: explicitly disable the format 1 package.
config.dependencies['@tauri-native/react-native'] = { platforms: { ios: null, android: null } };
config.project = { ...config.project, ios: { ...config.project?.ios, sourceDir: __dirname } };
process.stdout.write(JSON.stringify(config));
`,
  };
}
