import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const packages = fileURLToPath(new URL('../..', import.meta.url));
const shims = [
  'react-native/ios/TNTauriWebView.swift',
  'lynx/ios/src/TNTauriLynxWebView.swift',
  'react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt',
  'lynx/android/src/main/java/dev/taurinative/lynx/TauriWebView.java',
];

function load(file: string) {
  const source = readFileSync(path.join(packages, file), 'utf8');
  const script = source.match(/(?:bridgeSource|BRIDGE_SOURCE)\s*=\s*"""([\s\S]*?)"""/)?.[1];
  assert.ok(script, `The actual injected script must be available in ${file}`);
  const messages: Record<string, any>[] = [];
  const timers = new Map<number, () => void>();
  const events: Record<string, () => void> = {};
  let nextTimer = 0;
  const window: Record<string, any> = {
    addEventListener(name: string, callback: () => void) { events[name] = callback; },
    webkit: { messageHandlers: { tauriNative: { postMessage(value: any) { messages.push(value); } } } },
    TauriNativeBridge: { postMessage(value: string) { messages.push(JSON.parse(value)); } },
  };
  runInNewContext(script, { window,
    setTimeout(callback: () => void) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  return { window, messages, timers, events,
    invoke: window.__TAURI_INTERNALS__.invoke,
    tick() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    settle(request: any, response: unknown) { window.__RNTauriResolve(request.document, request.id, JSON.stringify(response)); },
  };
}

describe('native WebView invoke protocol', () => {
  for (const file of shims) {
    it(`${file} preserves Tauri values/errors across supported ABIs`, async () => {
      const host = load(file);
      assert.equal(host.window.__TAURI_NATIVE_HOST__, file.startsWith('lynx') ? 'lynx' : 'react-native');
      for (const abiVersion of [1, 2]) {
        const success = host.invoke('greet', { displayName: 'Ada' });
        host.settle(host.messages.at(-1), { abiVersion, ok: true, value: { displayName: '한글 🦀' } });
        assert.equal(JSON.stringify(await success), JSON.stringify({ displayName: '한글 🦀' }));
        const failure = host.invoke('describe', {});
        host.settle(host.messages.at(-1), { abiVersion, ok: false, error: { kind: 'empty_name' } });
        await assert.rejects(failure, (error: unknown) => JSON.stringify(error) === JSON.stringify({ kind: 'empty_name' }));
        const unit = host.invoke('nothing');
        host.settle(host.messages.at(-1), { abiVersion, ok: true, value: null });
        assert.equal(await unit, null);
      }
      const legacy = host.invoke('calculate', {});
      host.settle(host.messages.at(-1), { ok: true, value: 42 });
      assert.equal(JSON.stringify(await legacy), JSON.stringify({ ok: true, value: 42 }));
      const incompatible = host.invoke('greet', {});
      host.settle(host.messages.at(-1), { abiVersion: 99, ok: true, value: 42 });
      await assert.rejects(incompatible, /invalid_response/);
      assert.equal(host.timers.size, 0, 'Idle documents stop polling');
    });

    it(`${file} routes out-of-order results and discards a retired document`, async () => {
      const host = load(file);
      const slow = host.invoke('slow', {});
      const first = host.messages.at(-1)!;
      const fast = host.invoke('fast', {});
      const second = host.messages.at(-1)!;
      host.tick();
      assert.equal(host.messages.at(-1)?.type, 'poll');
      host.tick();
      assert.equal(host.messages.filter(m => m.type === 'poll').length, 1, 'Only one poll may be in flight');
      host.window.__RNTauriDrain(first.document, JSON.stringify([{ id: second.id, response: JSON.stringify({ abiVersion: 2, ok: true, value: 'fast' }) }]));
      assert.equal(await fast, 'fast');
      assert.equal(host.timers.size, 1);
      const cancelled = assert.rejects(slow, { name: 'AbortError' });
      host.events.pagehide!();
      await cancelled;
      assert.equal(host.messages.at(-1)?.type, 'close');
      assert.equal(host.timers.size, 0);
      await assert.rejects(host.invoke('after-close', {}), /closed_document/);
      host.events.pageshow!();
      const fresh = host.invoke('fresh', {});
      const current = host.messages.at(-1)!;
      assert.notEqual(current.document, first.document);
      host.window.__RNTauriDrain(first.document, JSON.stringify([{ id: current.id, response: JSON.stringify({ abiVersion: 2, ok: true, value: 'stale' }) }]));
      host.settle(current, { abiVersion: 2, ok: true, value: 'fresh' });
      assert.equal(await fresh, 'fresh');
      assert.equal(host.timers.size, 0);
      const broken = host.invoke('broken', {});
      host.window.__RNTauriDrain(current.document, '{"error":"closed_session"}');
      await assert.rejects(broken, /closed_session/);
      const cyclic: any = {}; cyclic.value = cyclic;
      await assert.rejects(host.invoke('invalid-json', cyclic), /circular/i);
      assert.equal(host.timers.size, 0, 'Transport errors release document work');
    });
  }
});
