import { invoke } from '@tauri-apps/api/core';
import { listen, once, emitTo } from '@tauri-apps/api/event';

const target = { kind: 'Webview', label: 'main' };
const documentId = new URLSearchParams(location.search).get('documentId') ?? 'desktop';
const fragment = location.hash;
document.querySelector('#context').textContent = `${documentId} ${fragment}`;
document.querySelector('#reload').textContent = `Reload ${documentId}`;
document.querySelector('#reload').onclick = () => location.reload();
document.querySelector('#unsubscribe').textContent = `Unsubscribe ${documentId}`;
const check = (condition, description) => { if (!condition) throw new Error(description); };

async function start() {
  let messages = 0;
  const unsubscribe = await listen('host-update', event => {
    messages++;
    document.querySelector('#message').textContent = `${documentId}: ${JSON.stringify(event.payload)}`;
    emitTo(target, 'reply', { documentId, fragment, payload: event.payload, messages });
  }, { target });
  document.querySelector('#unsubscribe').onclick = async () => {
    unsubscribe();
    document.querySelector('#message').textContent = `${documentId} unsubscribed`;
    await emitTo(target, 'subscription', { documentId, subscribed: false });
  };

  const received = [];
  let onceCount = 0;
  const stop = await listen('probe', ({ id, event, payload }) => received.push({ id, event, payload }), { target });
  await once('probe', () => onceCount++, { target });
  async function send(payload) {
    let delivered;
    const delivery = new Promise(resolve => { delivered = resolve; });
    await once('probe', delivered, { target });
    await emitTo(target, 'probe', payload);
    await delivery;
  }
  const payload = { text: '한글 🦀', nested: [1, true, null] };
  await send(payload);
  await send('second');
  check(received.length === 2 && onceCount === 1, 'listen and once delivery');
  check(received[0].payload.text === payload.text && JSON.stringify(received[0].payload.nested) === JSON.stringify(payload.nested), 'JSON payload');
  check(received[0].id === received[1].id && received[0].event === 'probe', 'subscription identity');
  stop();
  await send('after unlisten');
  check(received.length === 2 && onceCount === 1, 'unlisten cleanup');
  const report = { passed: true, documentId, fragment, listen: 2, once: onceCount, unlisten: true, payload };
  await invoke('record', { report: JSON.stringify(report) });
  document.querySelector('#result').textContent = `${documentId} standard events PASS`;
  await emitTo(target, 'fixture-ready', report);
}

start().catch(async error => {
  document.querySelector('#result').textContent = `FAILED: ${error.message ?? error}`;
  await invoke('record', { report: JSON.stringify({ passed: false, error: String(error) }) });
});
