import { invoke } from '@tauri-apps/api/core';

const documentId = `${Date.now()}:${Math.random()}`;
const status = document.querySelector<HTMLElement>('#result')!;
const pulse = document.querySelector<HTMLElement>('#pulse-result')!;
let running = false;
let pulses = 0;
let run = 0;

async function check() {
  const order = [];
  const label = `web-check-slow:${documentId}`;
  const slow = invoke('held', { label }).then(value => {
    if (value !== label) throw new Error('Slow response routing');
    order.push('slow');
  });
  try {
    const fastLabel = `web-check-fast:${documentId}`;
    if (await invoke('delayed', { label: fastLabel, milliseconds: 0 }) !== fastLabel) throw new Error('Fast response routing');
    order.push('fast');
  } finally { await invoke('release', { label }); }
  await slow;
  if (order.join() !== 'fast,slow') throw new Error('Results were not concurrent');
  document.querySelector<HTMLElement>('#order')!.textContent = `Frontend order: ${order.join()}`;
  try {
    await invoke('domain_failure');
    throw new Error('Domain failure resolved');
  } catch (error) { if ((error as { kind?: string }).kind !== 'expected_failure') throw error; }
  if (await invoke('nothing') !== null) throw new Error('Unit result changed');
  status.textContent = 'Frontend async contract passed';
}

document.querySelector<HTMLElement>('#start')!.addEventListener('click', async () => {
  running = true;
  status.textContent = 'Frontend work running';
  try {
    await invoke('delayed', { label: `web-retired:${documentId}:${++run}`, milliseconds: 12000 });
    status.textContent = 'Frontend work completed';
  } catch (error) { status.textContent = `Frontend error: ${error instanceof Error ? error.message : JSON.stringify(error)}`; }
  finally { running = false; }
});
document.querySelector<HTMLElement>('#pulse')!.addEventListener('click', () => {
  pulse.textContent = `Frontend pulse: ${++pulses}; running: ${running}`;
});
document.querySelector<HTMLElement>('#reload')!.addEventListener('click', () => location.reload());
check().catch(error => { status.textContent = `Frontend FAILED: ${error instanceof Error ? error.message : JSON.stringify(error)}`; });
