import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { output, record, run } from './common.ts';
import { readRetainedInput, retainedInput, retainedPayload } from './retained-common.ts';

readRetainedInput();
mkdirSync(retainedPayload, { recursive: true });
run('retained-unpack', 'tar', ['-xzf', path.join(retainedInput, 'retained.tar.gz'), '-C', retainedPayload]);
const work = mkdtempSync(path.join(tmpdir(), 'tauri-retained-ci-dependencies-'));
const nativePath = (process.env.PATH ?? '').split(path.delimiter).filter(directory => !['cargo', 'rustc'].some(tool => existsSync(path.join(directory, tool)))).join(path.delimiter);
const dependencies = {
  'react-native': { expo: '57.0.19', react: '19.2.3', 'react-native': '0.86.3', 'react-native-safe-area-context': '5.7.0',
    'expo-file-system': '57.0.6', 'expo-constants': '57.0.17', 'expo-modules-core': '57.0.15', 'expo-location': '57.0.15', 'babel-preset-expo': '57.0.10' },
  lynx: { '@lynx-js/react': '0.125.0', '@lynx-js/react-rsbuild-plugin': '0.19.1', '@lynx-js/rspeedy': '0.16.5', '@lynx-js/types': '4.1.0', typescript: '6.0.3' },
};
for (const [sdk, packages] of Object.entries(dependencies)) {
  const host = path.join(work, sdk); mkdirSync(host);
  record(path.join(host, 'package.json'), { name: `retained-ci-${sdk}`, private: true, dependencies: packages });
  run(`retained-install-${sdk}`, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], host, { ...process.env, PATH: nativePath });
}
record(path.join(output, 'retained-hosts.json'), { work, nativePath });
