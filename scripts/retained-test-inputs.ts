import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

type Run = (label: string, command: string, args: string[], cwd?: string) => string;
type Sdk = 'react-native' | 'lynx';
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Native gates consume the producer's exact tarball when one is transferred. */
export function prepareRetainedPackage(root: string, sdk: Sdk, consumer: string, run: Run, env = process.env) {
  const transferred = env.TAURI_NATIVE_SDK_TARBALL;
  let tarball: string;
  if (transferred) {
    assert.match(env.TAURI_NATIVE_SDK_SHA256 ?? '', /^[a-f0-9]{64}$/, 'Transferred SDK requires its producer SHA-256');
    assert.equal(digest(transferred), env.TAURI_NATIVE_SDK_SHA256, 'Transferred SDK bytes differ from the producer');
    tarball = path.join(consumer, path.basename(transferred));
    cpSync(transferred, tarball);
  } else {
    assert(!env.TAURI_NATIVE_SDK_SHA256, 'SDK digest requires a transferred tarball');
    assert.notEqual(env.GITHUB_ACTIONS, 'true', 'CI must use the transferred SDK, without local repacking');
    const directory = path.join(root, 'packages', sdk);
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    tarball = path.join(consumer, `tauri-native-${sdk}-${manifest.version}.tgz`);
    run('package', 'npm', ['pack', '--pack-destination', consumer], directory);
  }
  const sha256 = digest(tarball);
  if (transferred) assert.equal(sha256, env.TAURI_NATIVE_SDK_SHA256);
  const manifest = JSON.parse(run('packed-manifest', 'tar', ['-xOzf', tarball, 'package/package.json'], consumer));
  assert.equal(manifest.name, `@tauri-native/${sdk}`, 'Transferred package is not the requested SDK');
  run('unpack', 'tar', ['-xzf', tarball], consumer);
  return { directory: path.join(consumer, 'package'), tarball, sha256, source: transferred ? 'transferred' : 'local-pack' };
}

export function retainedDependencies(root: string, sdk: Sdk) {
  return realpathSync(path.resolve(process.env.RETAINED_DEPENDENCIES ?? path.join(root, 'examples', sdk)));
}

export function retainedEvidence(root: string, name: string) {
  return path.resolve(process.env.RETAINED_TEST_OUTPUT ?? path.join(root, 'target'), name);
}
