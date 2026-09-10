import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { tree } from '../../src/artifacts/cache.ts';
import { resolveRuntimeDependencies } from '../../src/runtime/dependencies.ts';

// These small local crates exercise real Cargo resolution, not native plugin
// compatibility. The separately executed ordinary Tauri gates establish that.
function workspace(edit: (manifest: string) => string, run: (manifest: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'retained dependency graph '));
  const write = (file: string, contents: string) => {
    const destination = path.join(directory, file);
    mkdirSync(path.dirname(destination), { recursive: true }); writeFileSync(destination, contents);
  };
  const crate = (folder: string, name: string, version: string, extra = '') => {
    write(`${folder}/Cargo.toml`, `[package]\nname="${name}"\nversion="${version}"\nedition="2021"\n${extra}`);
    write(`${folder}/src/lib.rs`, '');
  };
  try {
    write('Cargo.toml', '[workspace]\nmembers=["app", "tool"]\nresolver="2"\n');
    crate('tauri', 'tauri', '2.11.5', '[features]\ncustom-protocol=[]\n');
    crate('location', 'tauri-plugin-geolocation', '2.3.3');
    crate('links', 'tauri-plugin-deep-link', '2.4.10');
    crate('desktop', 'tauri-plugin-desktop-test', '0.1.0');
    crate('optional', 'tauri-plugin-optional-test', '0.1.0');
    crate('dev-only', 'tauri-plugin-test-only', '0.1.0');
    crate('helper', 'ordinary-helper', '0.1.0', `[dependencies]
location={package="tauri-plugin-geolocation", path="../location"}
[target.'cfg(not(any(target_os="ios", target_os="android")))'.dependencies]
desktop={package="tauri-plugin-desktop-test", path="../desktop"}
`);
    crate('tool', 'unrelated-workspace-tool', '0.1.0', '[dependencies]\ndesktop={package="tauri-plugin-desktop-test", path="../desktop"}\n');
    crate('app', 'ordinary-app', '0.1.0', edit(`[features]
extra=["dep:optional"]
[dependencies]
tauri={path="../tauri"}
helper={package="ordinary-helper", path="../helper"}
links={package="tauri-plugin-deep-link", path="../links"}
optional={package="tauri-plugin-optional-test", path="../optional", optional=true}
[dev-dependencies]
test-only={package="tauri-plugin-test-only", path="../dev-only"}
`));
    const manifest = path.join(directory, 'app/Cargo.toml');
    execFileSync('cargo', ['generate-lockfile', '--offline', '--manifest-path', manifest], { stdio: 'pipe' });
    const before = tree(directory, () => false);
    run(manifest);
    assert.deepEqual(tree(directory, () => false), before, 'Resolution and rejected plugins preserve source/lockfile bytes');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('mobile graphs ignore desktop-only, dev-only and unrelated workspace plugins while retaining renamed/transitive plugins', () => workspace(value => value, manifest => {
  assert.match(readFileSync(path.join(path.dirname(manifest), '../Cargo.lock'), 'utf8'), /tauri-plugin-desktop-test/);
  for (const targets of [['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios'],
    ['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android']]) {
    const result = resolveRuntimeDependencies(manifest, { targets, features: ['tauri/custom-protocol'] });
    assert.deepEqual(result.plugins, { 'tauri-plugin-deep-link': '2.4.10', 'tauri-plugin-geolocation': '2.3.3' });
    assert(!result.packages.some(pkg => ['unrelated-workspace-tool', 'tauri-plugin-desktop-test', 'tauri-plugin-test-only', 'tauri-plugin-optional-test'].includes(pkg.name)));
  }
}));

test('the same desktop plugin is diagnosed when it is reachable on the selected target', () => workspace(value => value, manifest => {
  assert.throws(() => resolveRuntimeDependencies(manifest, { targets: ['aarch64-apple-darwin'], features: ['tauri/custom-protocol'] }),
    /tauri-plugin-desktop-test@0\.1\.0 on aarch64-apple-darwin/);
}));

test('a build feature cannot activate an unverified optional plugin without a diagnostic', () => workspace(value => value, manifest => {
  for (const target of ['aarch64-apple-ios-sim', 'aarch64-linux-android']) {
    assert.throws(() => resolveRuntimeDependencies(manifest, { targets: [target], features: ['tauri/custom-protocol', 'extra'] }),
      new RegExp(`tauri-plugin-optional-test@0\\.1\\.0 on ${target}`));
  }
}));

test('default features remain enabled when verifying mobile plugins', () => workspace(value => value.replace('[features]', '[features]\ndefault=["extra"]'), manifest => {
  assert.throws(() => resolveRuntimeDependencies(manifest, { targets: ['aarch64-linux-android'], features: ['tauri/custom-protocol'] }),
    /tauri-plugin-optional-test@0\.1\.0 on aarch64-linux-android/);
}));

test('build dependencies remain part of the verified export graph', () => workspace(value => value.replace('[dev-dependencies]', '[build-dependencies]'), manifest => {
  assert.throws(() => resolveRuntimeDependencies(manifest, { targets: ['aarch64-linux-android'], features: ['tauri/custom-protocol'] }),
    /tauri-plugin-test-only@0\.1\.0 on aarch64-linux-android/);
}));

test('one receipt cannot claim a plugin that is absent from one of its native slices', () => workspace(value => value
  .replace('links={package="tauri-plugin-deep-link", path="../links"}\n', '')
  + '[target.\'cfg(target_arch="x86_64")\'.dependencies]\nlinks={package="tauri-plugin-deep-link", path="../links"}\n', manifest => {
  const features = ['tauri/custom-protocol'];
  assert.deepEqual(resolveRuntimeDependencies(manifest, { targets: ['aarch64-apple-ios-sim'], features }).plugins, { 'tauri-plugin-geolocation': '2.3.3' });
  assert.throws(() => resolveRuntimeDependencies(manifest, { targets: ['aarch64-apple-ios-sim', 'x86_64-apple-ios'], features }),
    /same native plugin versions on every selected slice/);
}));
