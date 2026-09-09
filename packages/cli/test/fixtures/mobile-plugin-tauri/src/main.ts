import { checkPermissions, requestPermissions, getCurrentPosition } from '@tauri-apps/plugin-geolocation';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appDataDir } from '@tauri-apps/api/path';

interface Snapshot { value: number; setupCount: number; pluginSetupCount: number; appIdentifier: string }
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const current = await invoke<Snapshot>('snapshot');
  check(current.setupCount === 1 && current.pluginSetupCount === 1, 'Setup and plugin initialization execute exactly once');
  check(current.appIdentifier === 'dev.taurinative.mobilefieldnotes', 'AppHandle retains ordinary app configuration');
  if (sessionStorage.getItem('reload-proof')) {
    sessionStorage.removeItem('reload-proof');
    check(current.value === 45, 'WebView reload preserves application state');
    check(await invoke('plugin:runtime-probe|read') === 0, 'Denied plugin command has no side effect after reload');
    return { passed: true, state: current, reloaded: true, directory: await appDataDir(),
      scenarios: ['setup', 'state', 'app-handle', 'async', 'rust-event', 'plugin-setup', 'plugin-allowed', 'plugin-denied', 'domain-error', 'reload'] };
  }
  check(current.value === 40, 'Setup initializes the state');
  check(await invoke('plugin:runtime-probe|read') === 0, 'Plugin owns initialized state');
  let receive!: (value: Snapshot) => void;
  const changed = new Promise<Snapshot>(resolve => { receive = resolve; });
  const unlisten = await listen<Snapshot>('counter-changed', event => receive(event.payload));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const next = await invoke<Snapshot>('increment', { delta: 2 });
    check(next.value === 42, 'Command mutates managed state');
    const observed = await Promise.race([changed, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Rust event did not arrive')), 10000);
    })]);
    check(observed.value === next.value, 'Rust event carries the command result');
  } finally {
    clearTimeout(timer);
    unlisten();
  }
  check((await invoke<Snapshot>('increment_async', { delta: 3 })).value === 45, 'Async command shares AppHandle state');
  let domainError: unknown;
  try { await invoke('increment', { delta: -1 }); } catch (error) { domainError = error; }
  check(domainError === 'Use a positive delta.', 'Ordinary Result::Err rejects unchanged');
  let denied = false;
  try { await invoke('plugin:runtime-probe|forbidden'); } catch { denied = true; }
  check(denied, 'Tauri denies the forbidden plugin command');
  check(await invoke('plugin:runtime-probe|read') === 0, 'Denied plugin command must never execute');
  sessionStorage.setItem('reload-proof', '1');
  window.location.reload();
}

run().catch(error => ({ passed: false, error: String(error) })).then(async report => {
  if (!report) return;
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  await invoke('record_report', { report });
});


const status = document.querySelector<HTMLElement>('#status')!;
const describe = (value: unknown) => { status.textContent = typeof value === 'string' ? value : JSON.stringify(value); };
let lastAction: { action: string; ok: boolean; result: unknown } | undefined;
async function refresh() {
  const result = await invoke<{ notes: unknown[]; links: string[] }>('plugin_snapshot');
  document.querySelector('#notes')!.textContent = JSON.stringify(result.notes, null, 2);
  document.querySelector('#links')!.textContent = `Links received ${result.links.length}`;
  await invoke('record_report', { report: { kind: 'plugins', ...lastAction, snapshot: result } });
}
function action(id: string, run: () => Promise<unknown>) {
  document.querySelector(id)!.addEventListener('click', async () => {
    try { lastAction = { action: id, ok: true, result: await run() }; }
    catch (error) { lastAction = { action: id, ok: false, result: String(error) }; }
    describe(lastAction.result);
    await refresh();
  });
}
action('#permissions', async () => {
  const value = await checkPermissions();
  return `Location permission ${value.location}`;
});
action('#request', async () => {
  const value = await requestPermissions(['location']);
  return `Location permission ${value.location}`;
});
action('#save', async () => {
  const position = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  const note = await invoke<{ id: number }>('save_note', { text: 'A place to remember', latitude: position.coords.latitude, longitude: position.coords.longitude });
  await refresh();
  return `Saved location note ${note.id}`;
});
action('#deny', async () => {
  try { await invoke('plugin:geolocation|watch_position', {}); }
  catch (error) {
    if (!String(error).includes('not allowed')) throw error;
    return 'Tauri capability denied location watch';
  }
  throw new Error('Denied geolocation command unexpectedly ran');
});
action('#refresh', async () => { await refresh(); return `Current links ${JSON.stringify(await getCurrent())}`; });
listen('fieldnotes-updated', refresh).catch(describe);
onOpenUrl(refresh).catch(describe);
refresh().catch(describe);
