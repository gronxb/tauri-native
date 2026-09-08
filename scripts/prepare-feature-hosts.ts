import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [rn, lynx, expo] = process.argv.slice(2).map(value => path.resolve(value));
assert(rn && lynx, 'Usage: node scripts/prepare-feature-hosts.ts RN_HOST LYNX_HOST [EXPO_HOST]');
const evidence = path.join(root, process.env.FIELDNOTES_CHANGED_RUST === '1' ? 'target/document-feature-changed' : 'target/document-feature');
const report = JSON.parse(readFileSync(path.join(evidence, 'export-report.json'), 'utf8')) as import('./validation-types.ts').FeatureExport;
assert(report.desktopFrontend.every(result => result.passed) && report.producerDeleted, 'Complete the document export gate first');
for (const [host, sdk, bare] of [[rn, 'react-native', true], [lynx, 'lynx', false], ...(expo ? [[expo, 'react-native', false]] : [])] as [string, string, boolean][]) {
  const require = createRequire(path.join(host, 'package.json'));
  const { readArtifacts } = require(`@tauri-native/${sdk}/artifacts`);
  for (const platform of ['ios', 'android']) {
    const artifacts = path.join(evidence, 'artifacts', platform);
    readArtifacts(artifacts, platform);
    const output = path.join(host, 'tauri-native', platform);
    rmSync(output, { recursive: true, force: true });
    cpSync(artifacts, output, { recursive: true });
  }
  const contract = readFileSync(path.join(host, 'tauri-native/ios/commands.ts'), 'utf8');
  assert.equal(contract, readFileSync(path.join(host, 'tauri-native/android/commands.ts'), 'utf8'));
  writeFileSync(path.join(host, 'tauri-native/commands.ts'), contract);
  mkdirSync(path.join(host, 'src'), { recursive: true });
  cpSync(path.join(root, 'examples', sdk, 'src/App.tsx'), path.join(host, 'src/App.tsx'));
  if (sdk === 'lynx') {
    cpSync(path.join(root, 'examples/lynx/src/App.css'), path.join(host, 'src/App.css'));
    cpSync(path.join(root, 'examples/lynx/src/tsconfig.json'), path.join(host, 'src/tsconfig.json'));
  }
  if (bare) writeFileSync(path.join(host, 'App.tsx'), "export { default } from './src/App';\n");
}
console.log('Prepared copied document artifacts and generated contracts; rebuild native hosts with the packed SDKs.');
