import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext, SourceTextModule } from 'node:vm';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const apiDirectory = path.join(root, 'examples/tauri/node_modules/@tauri-apps/api');
assert.equal(JSON.parse(readFileSync(path.join(apiDirectory, 'package.json'))).version, '2.11.1');
const target = { kind: 'Webview', label: 'main' };
const files = [
  'react-native/ios/TNTauriWebView.swift', 'lynx/ios/src/TNTauriLynxWebView.swift',
  'react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt',
  'lynx/android/src/main/java/dev/taurinative/lynx/TauriWebView.java',
];

async function document(file, api = 'event.js') {
  const source = readFileSync(path.join(root, 'packages', file), 'utf8');
  const script = source.match(/(?:bridgeSource|BRIDGE_SOURCE)\s*=\s*"""([\s\S]*?)"""/)[1];
  const messages = [];
  const lifecycle = {};
  const window = {
    document: { readyState: 'loading' },
    addEventListener(name, callback) { lifecycle[name] = callback; },
    webkit: { messageHandlers: { tauriNative: { postMessage(value) { messages.push(value); } } } },
    TauriNativeBridge: { postMessage(value) { messages.push(JSON.parse(value)); } },
  };
  const context = createContext({ window, setTimeout, clearTimeout });
  runInContext(script, context);
  const modules = new Map();
  async function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = new SourceTextModule(readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, module);
    await module.link((specifier, owner) => load(path.resolve(path.dirname(owner.identifier), specifier)));
    return module;
  }
  const module = await load(path.join(apiDirectory, api));
  await module.evaluate();
  return { api: module.namespace, window, lifecycle, messages, id: () => messages.findLast(m => m.type === 'open').document };
}

for (const file of files) {
  test(`${file}: standard appDataDir uses host storage and rejects other path operations`, async () => {
    const host = await document(file, 'path.js');
    const pending = host.api.appDataDir();
    const request = host.messages.findLast(m => m.type === 'invoke');
    assert.equal(request.command, 'plugin:path|resolve_directory');
    assert.deepEqual(JSON.parse(JSON.stringify(request.payload)), { directory: 14 });
    const directory = '/host private/한글 🦀/tauri-native/';
    host.window.__RNTauriResolve(host.id(), request.id, JSON.stringify(directory));
    assert.equal(await pending, directory);
    for (const unsupported of [() => host.api.appConfigDir(), () => host.api.appCacheDir(), () => host.api.homeDir(), () => host.api.join('a', 'b')]) {
      await assert.rejects(unsupported(), /unsupported_path_operation/);
    }
    await assert.rejects(host.window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', { directory: 14, path: '../elsewhere' }), /unsupported_path_operation/);
    assert.equal(host.messages.filter(m => m.type === 'invoke').length, 1, 'unsupported path calls never reach Rust');
    const abandoned = host.api.appDataDir();
    const last = host.messages.findLast(m => m.type === 'invoke');
    host.lifecycle.pagehide();
    await assert.rejects(abandoned, /closed_document/);
    host.window.__RNTauriResolve(host.id(), last.id, JSON.stringify(directory));
  });

  test(`${file}: actual Tauri event API, payloads, once/unlisten and isolated generations`, async () => {
    const first = await document(file), second = await document(file);
    assert.equal(first.messages.filter(m => m.type === 'ready').length, 0);
    first.window.document.readyState = 'complete';
    first.lifecycle.load(); first.lifecycle.load();
    assert.deepEqual(first.messages.filter(m => m.type === 'ready').map(m => m.document), [first.id()], 'ready is sent once for the loaded document');
    const received = [], other = [], once = [];
    const unlisten = await first.api.listen('selected', event => received.push(event), { target });
    const otherUnlisten = await second.api.listen('selected', event => other.push(event), { target });
    await first.api.once('selected', event => once.push(event.payload), { target });
    await first.api.emitTo(target, 'selected', { label: '한글 🦀', values: [1, null] });
    await first.api.emitTo(target, 'selected', 'next');
    await Promise.resolve();
    assert.deepEqual(JSON.parse(JSON.stringify(received.map(e => e.payload))), [{ label: '한글 🦀', values: [1, null] }, 'next']);
    assert.equal(received[0].event, 'selected');
    assert.equal(typeof received[0].id, 'number');
    assert.equal(received[0].id, received[1].id);
    assert.equal(once.length, 1);
    assert.equal(other.length, 0, 'a second native view is not another target of this document');
    assert.equal(first.messages.filter(m => m.type === 'event').length, 2);
    assert.equal(first.window.__RNTauriHostEvent(first.id(), 'selected', { from: 'host' }), '');
    await Promise.resolve();
    assert.equal(received.at(-1).payload.from, 'host');
    await unlisten();
    await first.api.emitTo(target, 'selected');
    assert.equal(received.length, 3);

    const old = first.id();
    await first.api.listen('selected', event => received.push(event), { target });
    first.window.__RNTauriHostEvent(old, 'selected', 'queued before teardown');
    first.lifecycle.pagehide();
    first.lifecycle.load();
    assert.equal(first.messages.filter(m => m.type === 'ready').length, 1, 'a retired document cannot become ready');
    await assert.rejects(first.api.emitTo(target, 'selected', 'closed'), /closed_document/);
    first.lifecycle.pageshow();
    const current = [];
    await first.api.listen('selected', event => current.push(event.payload), { target });
    assert.notEqual(first.id(), old);
    assert.deepEqual(first.messages.filter(m => m.type === 'ready').map(m => m.document), [old, first.id()], 'restored complete documents report a fresh generation');
    assert.equal(first.window.__RNTauriHostEvent(old, 'selected', 'late'), 'closed_document');
    first.window.__RNTauriHostEvent(first.id(), 'selected', 'fresh');
    await Promise.resolve();
    assert.deepEqual(current, ['fresh']);
    assert.equal(received.length, 3, 'retired and queued listeners are gone');
    await otherUnlisten();
    first.lifecycle.pagehide(); second.lifecycle.pagehide();
  });

  test(`${file}: unsupported scopes fail explicitly and failed listeners release callbacks`, async () => {
    const host = await document(file);
    for (let i = 0; i < 70; i++) await assert.rejects(host.api.listen('selected', () => {}), /unsupported_event_target/);
    await assert.rejects(host.api.emit('selected', 1), /unsupported_event_operation/);
    for (const invalid of ['main', { kind: 'App' }, { kind: 'Window', label: 'main' }, { kind: 'Webview', label: 'other' }]) {
      await assert.rejects(host.api.emitTo(invalid, 'selected', 1), /unsupported_event_target/);
    }
    await assert.rejects(host.api.listen('tauri://created', () => {}, { target }), /unsupported_system_event/);
    await assert.rejects(host.api.listen('not a name', () => {}, { target }), /unsupported_event_name/);
    const cyclic = {}; cyclic.self = cyclic;
    await assert.rejects(host.api.emitTo(target, 'selected', cyclic), /circular/i);
    assert.equal(host.messages.filter(m => m.type === 'event').length, 0);
    const listeners = [];
    for (let i = 0; i < 64; i++) listeners.push(await host.api.listen('selected', () => {}, { target }));
    await assert.rejects(host.api.listen('selected', () => {}, { target }), /event_listener_limit/);
    for (const unlisten of listeners) await unlisten();
    const fresh = await host.api.listen('selected', () => {}, { target });
    await fresh(); host.lifecycle.pagehide();
  });
}
