import { invoke } from '@tauri-apps/api/core';
import { listen, once, emitTo } from '@tauri-apps/api/event';

const target = { kind: 'Webview', label: 'main' } as const;
const documentId = new URLSearchParams(location.search).get('documentId') ?? 'desktop';
const fragment = location.hash;
document.querySelector<HTMLElement>('#context')!.textContent = `${documentId} ${fragment}`;
document.querySelector<HTMLElement>('#reload')!.textContent = `Reload ${documentId}`;
document.querySelector<HTMLElement>('#reload')!.onclick = () => location.reload();
document.querySelector<HTMLElement>('#unsubscribe')!.textContent = `Unsubscribe ${documentId}`;
const check = (condition: unknown, description: string) => { if (!condition) throw new Error(description); };

async function start() {
  let messages = 0;
  const unsubscribe = await listen('host-update', event => {
    messages++;
    document.querySelector<HTMLElement>('#message')!.textContent = `${documentId}: ${JSON.stringify(event.payload)}`;
    emitTo(target, 'reply', { documentId, fragment, payload: event.payload, messages });
  }, { target });
  document.querySelector<HTMLElement>('#unsubscribe')!.onclick = async () => {
    unsubscribe();
    document.querySelector<HTMLElement>('#message')!.textContent = `${documentId} unsubscribed`;
    await emitTo(target, 'subscription', { documentId, subscribed: false });
  };

  const received: import('@tauri-apps/api/event').Event<unknown>[] = [];
  let onceCount = 0;
  const stop = await listen('probe', ({ id, event, payload }) => received.push({ id, event, payload }), { target });
  await once('probe', () => onceCount++, { target });
  async function send(payload: unknown) {
    let delivered!: (event: unknown) => void;
    const delivery = new Promise(resolve => { delivered = resolve; });
    await once('probe', delivered, { target });
    await emitTo(target, 'probe', payload);
    await delivery;
  }
  const payload = { text: '한글 🦀', nested: [1, true, null] };
  await send(payload);
  await send('second');
  check(received.length === 2 && onceCount === 1, 'listen and once delivery');
  check((received[0]!.payload as typeof payload).text === payload.text && JSON.stringify((received[0]!.payload as typeof payload).nested) === JSON.stringify(payload.nested), 'JSON payload');
  check(received[0]!.id === received[1]!.id && received[0]!.event === 'probe', 'subscription identity');
  stop();
  await send('after unlisten');
  check(received.length === 2 && onceCount === 1, 'unlisten cleanup');
  const report = { passed: true, documentId, fragment, listen: 2, once: onceCount, unlisten: true, payload };
  await invoke('record', { report: JSON.stringify(report) });
  document.querySelector<HTMLElement>('#result')!.textContent = `${documentId} standard events PASS`;
  await emitTo(target, 'fixture-ready', report);
}

start().catch(async error => {
  document.querySelector<HTMLElement>('#result')!.textContent = `FAILED: ${error.message ?? error}`;
  await invoke('record', { report: JSON.stringify({ passed: false, error: String(error) }) });
});
