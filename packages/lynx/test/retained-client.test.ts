import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { openSession, type RuntimeTransport, type RuntimeEvent } from '../src/retained-client.ts';

const unexpected = (value: unknown): never => assert.fail(JSON.stringify(value));

function runtime() {
  type Operation = { operation: Record<string, unknown>; reply: Parameters<RuntimeTransport>[1] };
  const operations: Operation[] = [];
  const native: RuntimeTransport = (operation, reply) => {
    if (operation.op === 'status') reply({ ok: true, status: 'ready', features: ['commands', 'events'] });
    else if (operation.op === 'open') reply({ ok: true, session: 'surface-session' });
    else if (['close', 'cancel', 'unlisten'].includes(String(operation.op))) { operations.push({ operation, reply }); reply({ ok: true }); }
    else operations.push({ operation, reply });
  };
  async function take(op: string) {
    for (let i = 0; i < 100; i++) {
      const index = operations.findIndex(item => item.operation.op === op);
      if (index !== -1) return operations.splice(index, 1)[0]!;
      await delay(2);
    }
    throw new Error(`Missing ${op}`);
  }
  return { native, take, operations };
}

test('original command failures and concurrent results survive the module; cancellation retires only its request', async () => {
  const host = runtime(), session = await openSession(host.native, 'native');
  try {
    const abandoned = session.invoke('save_note', { text: 'retired' });
    const failure = session.invoke('save_note', { text: '' });
    const success = session.invoke('snapshot', {});
    const a = await host.take('invoke'), b = await host.take('invoke'), c = await host.take('invoke');
    const cancelled = assert.rejects(abandoned, { code: 'request_cancelled' });
    abandoned.cancel(); await cancelled;
    assert.equal((await host.take('cancel')).operation.id, a.operation.id);
    c.reply({ ok: true, value: { value: 45, setupCount: 1 } });
    b.reply({ ok: false, error: { message: 'producer-defined error', details: [1, 2] } });
    a.reply({ ok: true, value: 'late side effect result' });
    assert.deepEqual(await failure, { ok: false, error: { message: 'producer-defined error', details: [1, 2] } });
    assert.deepEqual(await success, { ok: true, value: { value: 45, setupCount: 1 } });
  } finally { await session.close(); }
});

test('an in-flight event batch waits for a new listener acknowledgement instead of losing its first event', async () => {
  const host = runtime(), session = await openSession(host.native, 'native');
  const received: RuntimeEvent[] = [];
  try {
    const first = session.listen('existing', event => received.push(event), unexpected);
    (await host.take('listen')).reply({ ok: true, subscription: 1 }); await first;
    const batch = await host.take('events');
    const second = session.listen('fieldnotes-updated', event => received.push(event), unexpected);
    const registration = await host.take('listen');
    const event = { subscription: 2, event: 'fieldnotes-updated', payload: { note: 1 } };
    batch.reply({ ok: true, events: [event] });
    await delay(1); assert.deepEqual(received, []);
    registration.reply({ ok: true, subscription: 2 });
    const unlisten = await second;
    assert.deepEqual(received, [event]);
    await unlisten(); await unlisten();
    assert.equal(host.operations.filter(item => item.operation.op === 'unlisten').length, 1);
    (await host.take('events')).reply({ ok: true, events: [event] });
    await delay(1); assert.deepEqual(received, [event], 'A removed listener ignores a batch already in transit');
  } finally { await session.close(); }
});

test('closing while registration and commands are in flight settles them and ignores all late acknowledgements', async () => {
  const host = runtime(), session = await openSession(host.native, 'native');
  const invoke = session.invoke('plugin:geolocation|request_permissions', {});
  const listen = session.listen('fieldnotes-updated', unexpected, unexpected);
  const invokeFailure = assert.rejects(invoke, { code: 'session_closed' });
  const listenFailure = assert.rejects(listen, { code: 'session_closed' });
  const registration = await host.take('listen'), command = await host.take('invoke');
  await session.close(); await session.close();
  await Promise.all([invokeFailure, listenFailure]);
  registration.reply({ ok: true, subscription: 1 }); command.reply({ ok: true, value: 'granted' });
  await delay(20);
  assert.equal(host.operations.filter(item => item.operation.op === 'close').length, 1);
  assert.equal(host.operations.filter(item => item.operation.op === 'events').length, 0);
});

test('event overflow allows refetch and continued delivery; origin revocation closes the stream', async () => {
  const host = runtime(), session = await openSession(host.native, 'native');
  const errors: unknown[] = [], events: RuntimeEvent[] = [];
  try {
    const listen = session.listen('fieldnotes-updated', event => events.push(event), error => errors.push(error));
    (await host.take('listen')).reply({ ok: true, subscription: 1 }); await listen;
    (await host.take('events')).reply({ ok: false, code: 'event_overflow', error: 'Refetch required' });
    const event = { subscription: 1, event: 'fieldnotes-updated', payload: null };
    (await host.take('events')).reply({ ok: true, events: [event] });
    (await host.take('events')).reply({ ok: false, code: 'origin_not_allowed', error: 'Document changed' });
    await host.take('close');
    assert.equal(errors.length, 2); assert.deepEqual(events, [event]);
    await assert.rejects(session.invoke('snapshot', {}), { code: 'session_closed' });
  } finally { await session.close(); }
});
