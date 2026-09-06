import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [rn, lynx] = process.argv.slice(2).map(value => path.resolve(value));
assert(rn && lynx, 'Usage: node scripts/prepare-view-hosts.mjs RN_BASELINE_HOST LYNX_BASELINE_HOST');
const report = JSON.parse(readFileSync(path.join(root, 'target/view-events/export-report.json')));
assert(report.desktopFrontend.passed && report.producerDeleted, 'Complete the event export gate first');
for (const [host, sdk] of [[rn, 'react-native'], [lynx, 'lynx']]) {
  const require = createRequire(path.join(host, 'package.json'));
  const { readArtifacts } = require(`@tauri-native/${sdk}/artifacts`);
  for (const platform of ['ios', 'android']) {
    const artifacts = path.join(root, 'target/view-events/artifacts', platform);
    readArtifacts(artifacts, platform);
    const output = path.join(host, 'tauri-native', platform);
    rmSync(output, { recursive: true, force: true });
    cpSync(artifacts, output, { recursive: true });
  }
  const source = sdk === 'lynx' ? path.join(host, 'src') : host;
  cpSync(path.join(root, 'packages', sdk, 'test/native-artifacts/ViewApp.tsx'), path.join(source, 'App.tsx'));
  cpSync(path.join(root, 'scripts/view-contract.ts'), path.join(source, 'view-contract.ts'));
}
console.log('Prepared portable view/event fixtures; rebuild both native hosts.');
