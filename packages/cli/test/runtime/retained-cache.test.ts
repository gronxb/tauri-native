import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRuntimeCache, retainedInputs } from '../../src/runtime/cache.ts';
import { discoverProject } from '../../src/discovery/project.ts';
import { projectInputs } from '../../src/artifacts/cache.ts';
import { prepareRuntime, runtimeGeneratedPaths } from '../../src/runtime/workspace.ts';

test('retained input tracking includes native declarations and capabilities but excludes generated builds', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'retained native inputs '));
  const previousTarget = process.env.CARGO_TARGET_DIR;
  process.env.CARGO_TARGET_DIR = path.join(directory, 'custom-compiler-output');
  const write = (file: string, content: string) => { const target = path.join(directory, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); };
  try {
    cpSync(fileURLToPath(new URL('../fixtures/runtime-tauri', import.meta.url)), directory, { recursive: true });
    const project = discoverProject('src-tauri', directory, false, 'retained');
    const output = path.join(directory, 'copied exports/android');
    const native = ['gen/android/app/src/main/AndroidManifest.xml', 'gen/android/app/src/main/java/Custom.kt', 'gen/android/app/build.gradle.kts',
      'gen/apple/App/Info.plist', 'gen/apple/App/App.entitlements', 'gen/apple/Sources/Custom.swift', 'gen/apple/project.yml'];
    for (const file of native) write(`src-tauri/${file}`, 'authored native declaration');
    const before = retainedInputs(project, output);
    for (const relative of [...native, 'capabilities/main.json', 'Cargo.toml', 'Cargo.lock', 'tauri.conf.json']) {
      const file = path.join(project.tauriDirectory, relative), original = readFileSync(file), time = statSync(file);
      writeFileSync(file, Buffer.concat([original, Buffer.from('\nchanged native input')])); utimesSync(file, time.atime, time.mtime);
      assert.notDeepEqual(retainedInputs(project, output), before, `${relative} must invalidate with unchanged mtime`);
      writeFileSync(file, original);
    }
    for (const file of ['src-tauri/gen/android/app/build/generated', 'src-tauri/gen/apple/build/generated', 'src-tauri/gen/apple/Pods/generated',
      'src-tauri/gen/tauri-native/android/manifest.json', 'src-tauri/target/generated', 'copied exports/android/manifest.json',
      'copied exports/android.lock', 'copied exports/.android-stage-test/generated', 'custom-compiler-output/generated']) write(file, 'generated');
    assert.deepEqual(retainedInputs(project, output), before);
    const runtime = prepareRuntime(project, { version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } }, { output, verifyCopy(producer) {
      assert.deepEqual(projectInputs(project, output, producer, runtimeGeneratedPaths(project)), before.files);
      assert.throws(() => readFileSync(path.join(producer, 'copied exports/android/manifest.json')), { code: 'ENOENT' });
    } });
    runtime.cleanup();
    assert.deepEqual(retainedInputs(project, output), before, 'Runtime generation preserves all original native input bytes');
  } finally {
    if (previousTarget === undefined) delete process.env.CARGO_TARGET_DIR; else process.env.CARGO_TARGET_DIR = previousTarget;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a Cargo-config compiler wrapper is diagnosed before it can be silently replaced', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'retained compiler wrapper '));
  const previous = process.env.RUSTC_WRAPPER;
  try {
    cpSync(fileURLToPath(new URL('../fixtures/runtime-tauri', import.meta.url)), directory, { recursive: true });
    const project = discoverProject('src-tauri', directory, false, 'retained');
    mkdirSync(path.join(directory, '.cargo'));
    writeFileSync(path.join(directory, '.cargo/config.toml'), '[build]\nrustc-wrapper="producer-compiler-wrapper"\n');
    delete process.env.RUSTC_WRAPPER;
    assert.throws(() => createRuntimeCache(project, path.join(directory, 'artifacts'), 'ios', ['aarch64-sim'], 'debug',
      { version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } }), /RUSTC_WRAPPER.*producer Cargo compiler wrapper/);
  } finally {
    if (previous === undefined) delete process.env.RUSTC_WRAPPER; else process.env.RUSTC_WRAPPER = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
