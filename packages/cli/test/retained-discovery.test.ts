import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverProject } from '../src/discovery/project.ts';
import { prepareRuntime, validateCallerPolicy } from '../src/runtime/workspace.ts';
import { snapshot } from './native-export/source-integrity.ts';

test('retained inspection excludes aliased Tauri injections while preserving ordinary user payloads', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'retained inspection '));
  try {
    cpSync(fileURLToPath(new URL('./fixtures/runtime-tauri', import.meta.url)), directory, { recursive: true });
    const source = path.join(directory, 'src-tauri/src/lib.rs');
    writeFileSync(source, readFileSync(source, 'utf8').replace('use tauri::{AppHandle, Emitter, Manager, State};', 'use tauri::{Emitter, Manager};\nuse tauri as framework;')
      .replaceAll('AppHandle', 'framework::AppHandle').replaceAll("State<'_", "framework::State<'_"));
    const before = snapshot(directory);
    const project = discoverProject('src-tauri', directory, false, 'retained');
    assert.deepEqual(project.commands.find(command => command.name === 'snapshot')!.parameters, []);
    assert.deepEqual(project.commands.find(command => command.name === 'increment_async')!.parameters.map(parameter => parameter.key), ['delta']);
    assert.throws(() => prepareRuntime(project, { version: 1, callers: { native: { webview: 'main', commands: ['*'] } } }), /wildcards/);
    assert.deepEqual(snapshot(directory), before, 'Rejected policy must not modify the ordinary producer');
    // Tauri's mobile scaffolds may contain maintained OS declarations and
    // native code even though build caches also live under gen/.
    const manifest = 'gen/android/app/src/main/AndroidManifest.xml';
    const info = 'gen/apple/App/Info.plist';
    const cache = 'gen/android/app/build/generated-marker';
    for (const file of [manifest, info, cache]) {
      const target = path.join(directory, 'src-tauri', file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file);
    }
    const generated = prepareRuntime(project, { version: 1, callers: { native: { webview: 'main', commands: ['snapshot'] } } });
    try {
      for (const file of [manifest, info]) {
        assert.equal(readFileSync(path.join(generated.project.tauriDirectory, file), 'utf8'), file);
        assert.equal(readFileSync(path.join(directory, 'src-tauri', file), 'utf8'), file);
      }
      assert.equal(existsSync(path.join(generated.project.tauriDirectory, cache)), false);
      assert.equal(readFileSync(path.join(directory, 'src-tauri', cache), 'utf8'), cache);
    } finally { generated.cleanup(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('native policy requires exact delegated contexts and grants', () => {
  for (const policy of [
    { version: 1, callers: {} },
    { version: 1, callers: { native: { webview: '*', commands: ['snapshot'] } } },
    { version: 1, callers: { native: { webview: 'main', commands: ['plugin:*'] } } },
    { version: 1, callers: { native: { webview: 'main', commands: ['snapshot'], invokeKey: 'forged' } } },
  ]) assert.throws(() => validateCallerPolicy(policy));
  validateCallerPolicy({ version: 1, callers: { native: { webview: 'main', commands: ['snapshot', 'plugin:runtime-probe|read'] } } });
});
