import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const packages = fileURLToPath(new URL('../..', import.meta.url));
const shims = [
  ['react-native/ios/TNTauriWebView.swift', false],
  ['lynx/ios/src/TNTauriLynxWebView.swift', false],
  ['react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt', true],
  ['lynx/android/src/main/java/dev/taurinative/lynx/TauriWebView.java', true],
] as const;

describe('native WebView invoke protocol', () => {
  for (const [file, android] of shims) it(`${file} preserves ordinary Tauri values/errors and the explicit legacy route`, async () => {
    const source = readFileSync(path.join(packages, file), 'utf8');
    const script = source.match(/(?:bridgeSource|BRIDGE_SOURCE)\s*=\s*"""([\s\S]*?)"""/)?.[1];
    assert.ok(script, `The actual injected script must be available in ${file}`);
    let request: { id: number } | undefined;
    const window: Record<string, any> = {
      webkit: { messageHandlers: { tauriNative: { postMessage(value: { id: number }) { request = value; } } } },
      TauriNativeBridge: { invoke(value: string) { request = JSON.parse(value); } },
    };
    runInNewContext(script, { window });
    const settle = (response: unknown) => window.__RNTauriResolve(request!.id, android ? JSON.stringify(response) : response);
    const success = window.__TAURI_INTERNALS__.invoke('greet', { displayName: 'Ada' });
    settle({ abiVersion: 1, ok: true, value: { displayName: '한글 🦀' } });
    assert.equal(JSON.stringify(await success), JSON.stringify({ displayName: '한글 🦀' }));
    const failure = window.__TAURI_INTERNALS__.invoke('describe', {});
    settle({ abiVersion: 1, ok: false, error: { kind: 'empty_name' } });
    await assert.rejects(failure, (error: unknown) => JSON.stringify(error) === JSON.stringify({ kind: 'empty_name' }));
    const unit = window.__TAURI_INTERNALS__.invoke('nothing');
    settle({ abiVersion: 1, ok: true, value: null });
    assert.equal(await unit, null);
    const legacy = window.__TAURI_INTERNALS__.invoke('calculate', {});
    settle({ ok: true, value: 42 });
    assert.equal(JSON.stringify(await legacy), JSON.stringify({ ok: true, value: 42 }));
  });
});
