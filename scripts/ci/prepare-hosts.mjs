import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { json, output, readInput, record, root, run } from './common.mjs';

const input = path.resolve(process.env.FIELDNOTES_PACKAGES ?? path.join(output, 'input'));
const receipt = readInput(input);
run('unpack-exports', 'tar', ['-xzf', path.join(input, 'exports.tar.gz')]);
const work = mkdtempSync(path.join(tmpdir(), 'tauri-native-ci-hosts-'));
// Host builds must be possible with native tools and Node, without Rust tools.
const nativePath = process.env.PATH.split(path.delimiter)
  .filter(directory => !['cargo', 'rustc'].some(tool => existsSync(path.join(directory, tool))))
  .join(path.delimiter);
const env = { ...process.env, PATH: nativePath };
const hosts = { RN_HOST: path.join(work, 'rn'), LYNX_HOST: path.join(work, 'lynx'), EXPO_HOST: path.join(work, 'expo') };
run('rn-scaffold', 'npx', ['--yes', '@react-native-community/cli@20.1.0', 'init', 'TauriArtifactHost', '--version', '0.86.3', '--package-name', 'dev.taurinative.rnartifacttest', '--directory', hosts.RN_HOST, '--skip-install', '--skip-git-init'], work, env);
function copyExample(example, host) {
  const files = run(`list-${example}`, 'git', ['ls-files', '-z', `examples/${example}`]).split('\0').filter(Boolean);
  assert(files.length > 0);
  for (const file of files) {
    const destination = path.join(host, path.relative(`examples/${example}`, file));
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(root, file), destination);
  }
}
copyExample('lynx', hosts.LYNX_HOST);
copyExample('react-native', hosts.EXPO_HOST);
for (const [name, host] of Object.entries(hosts)) {
  const sdk = name === 'LYNX_HOST' ? 'lynx' : 'react-native';
  const packed = receipt.packages.find(item => item.sdk === sdk);
  mkdirSync(path.join(host, 'vendor-packages'));
  cpSync(path.join(input, sdk, packed.file), path.join(host, 'vendor-packages', packed.file));
  const manifest = json(path.join(host, 'package.json'));
  manifest.dependencies[`@tauri-native/${sdk}`] = `file:vendor-packages/${packed.file}`;
  if (sdk === 'lynx') {
    manifest.dependencies['@lynx-js/react'] = '0.125.0';
    manifest.dependencies['@lynx-js/lynx-ui'] = '3.137.0';
  } else {
    Object.assign(manifest.dependencies, { react: '19.2.3', 'react-native': '0.86.3', 'react-native-safe-area-context': '5.7.0' });
    if (name === 'EXPO_HOST') manifest.dependencies.expo = '57.0.20';
  }
  record(path.join(host, 'package.json'), manifest);
  run(`${name}-install`, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], host, env);
  const artifacts = ['ios', 'android'].map(platform => path.join(root, 'target/document-feature/artifacts', platform));
  if (name === 'EXPO_HOST') {
    for (const [index, platform] of ['ios', 'android'].entries()) cpSync(artifacts[index], path.join(host, 'tauri-native', platform), { recursive: true });
    const config = json(path.join(host, 'app.json'));
    config.expo.name = 'TauriArtifactExpo'; config.expo.slug = 'tauri-artifact-expo';
    config.expo.ios.bundleIdentifier = config.expo.android.package = 'dev.taurinative.rnartifacttest';
    record(path.join(host, 'app.json'), config);
    run('expo-scaffold', path.join(host, 'node_modules/.bin/expo'), ['prebuild', '--no-install', '--no-clean'], host, env);
  } else run(`${name}-prepare`, process.execPath, [path.join(root, 'packages', sdk, 'test/native-artifacts/prepare.mjs'), host, ...artifacts], root, env);
  if (process.platform === 'darwin' && name === 'LYNX_HOST') run('lynx-bundle-install', 'bundle', ['install'], path.join(host, 'ios'), { ...env, BUNDLE_PATH: 'vendor/bundle' });
}
const settings = { ...hosts, NATIVE_HOST_PATH: nativePath, FIELDNOTES_PACKAGES: input };
record(path.join(output, 'hosts.json'), settings);
if (process.env.GITHUB_ENV) {
  for (const [key, value] of Object.entries(settings)) {
    assert(!value.includes('\n'));
    appendFileSync(process.env.GITHUB_ENV, `${key}=${value}\n`);
  }
}
console.log(`Prepared three fresh consumers outside the checkout: ${work}`);
