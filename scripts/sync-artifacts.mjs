import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// Both npm packages ship this reader without a dependency on each other or the CLI.
const [host, mode] = process.argv.slice(2);
assert(['react-native', 'lynx'].includes(host), 'Choose react-native or lynx');
assert(mode === undefined || mode === '--check', 'Only --check is supported');
for (const [source, destination] of [
  ['artifacts.cjs', host === 'lynx' ? 'artifacts.cjs' : 'artifacts.js'],
  ['artifacts.d.ts', 'artifacts.d.ts'],
]) {
  const contents = readFileSync(new URL(source, import.meta.url), 'utf8');
  const output = new URL(`../packages/${host}/${destination}`, import.meta.url);
  if (mode === '--check') assert.equal(readFileSync(output, 'utf8'), contents, `Run node scripts/sync-artifacts.mjs ${host}`);
  else writeFileSync(output, contents);
}
