import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createInvoker } from '../src/async-client.ts';

type Request = { session: string; id: string; command: string; payload: unknown };

function transport() {
  const sessions = new Map<string, { id: string; response: string }[]>(), starts: Request[] = [], cancels: { session: string; id: string }[] = [], closed: string[] = [];
  let next = 0, polls = 0;
  const native: import('../src/async-client.ts').NativeTransport = {
    createSession() { const id = String(++next); sessions.set(id, []); return id; },
    start(session, id, command, payload) { starts.push({ session, id, command, payload: JSON.parse(payload) }); return ''; },
    poll(session) { polls++; const batch = sessions.get(session); sessions.set(session, []); return JSON.stringify(batch); },
    cancel(session, id) { cancels.push({ session, id }); },
    closeSession(session) { closed.push(session); sessions.delete(session); },
  };
  return { native, starts, cancels, closed, sessions, polls: () => polls,
    reply(request: Request, response: { ok: boolean; value?: unknown; error?: unknown }) { sessions.get(request.session)!.push({ id: request.id, response: JSON.stringify({ abiVersion: 2, ...response }) }); },
  };
}

test('out-of-order replies preserve domain results and stop polling once idle', async () => {
  const host = transport(), invoke = createInvoker(host.native);
  const first = invoke('slow', { value: '한글' }), second = invoke('fast', {});
  const otherClient = createInvoker(host.native)('isolated', {});
  assert.notEqual(host.starts[2]!.session, host.starts[0]!.session);
  host.reply(host.starts[2]!, { ok: true, value: 'isolated' });
  const isolated = await otherClient;
  assert(isolated.ok); assert.equal(isolated.value, 'isolated');
  assert.equal(host.sessions.size, 1, 'Closing another client must not close this client');
  host.reply(host.starts[1]!, { ok: false, error: { kind: 'domain_error' } });
  assert.deepEqual(await second, { abiVersion: 2, ok: false, error: { kind: 'domain_error' } });
  assert.equal(host.closed.length, 1);
  host.reply(host.starts[0]!, { ok: true, value: null });
  assert.deepEqual(await first, { abiVersion: 2, ok: true, value: null });
  assert.equal(host.closed.length, 2);
  const polls = host.polls(); await delay(40); assert.equal(host.polls(), polls);
  const next = invoke('next', {});
  assert.notEqual(host.starts[3]!.session, host.starts[0]!.session);
  host.reply(host.starts[3]!, { ok: true, value: 42 });
  await next;
});

test('cancellation, AbortSignal and completion races settle once and ignore late responses', async () => {
  const host = transport(), invoke = createInvoker(host.native);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(invoke('never', {}, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(host.starts.length, 0);
  const cancelled = invoke('cancel', {}), live = invoke('live', {});
  const rejection = assert.rejects(cancelled, { name: 'AbortError' });
  cancelled.cancel(); cancelled.cancel(); await rejection;
  assert.equal(host.cancels.length, 1);
  host.reply(host.starts[0]!, { ok: true, value: 'late' });
  host.reply(host.starts[1]!, { ok: true, value: 'live' });
  const response = await live;
  assert(response.ok); assert.equal(response.value, 'live');
  live.cancel(); assert.equal(host.cancels.length, 1);
  const signal = new AbortController();
  const signalled = invoke('signal', {}, { signal: signal.signal });
  const aborted = assert.rejects(signalled, { name: 'AbortError' });
  signal.abort(); await aborted;
  assert.equal(host.sessions.size, 0);
});

test('queue rejection and disposed or malformed transports release every pending request', async () => {
  const legacy = transport();
  legacy.native.createSession = () => '';
  await assert.rejects(createInvoker(legacy.native)('legacy', {}), /export ABI 2 artifacts/);
  assert.equal(legacy.starts.length, 0, 'Older artifacts must not start a blocking fallback');
  const host = transport();
  host.native.start = () => '{"error":"queue_full"}';
  await assert.rejects(createInvoker(host.native)('full', {}), { code: 'queue_full' });
  assert.equal(host.sessions.size, 0);
  for (const batch of ['{"error":"closed_session"}', '[{"id":"1","response":"{\\"abiVersion\\":2,\\"ok\\":true}"}]']) {
    const host = transport(), invoke = createInvoker(host.native);
    host.native.poll = () => batch;
    const first = invoke('one', {}), second = invoke('two', {});
    await Promise.all([assert.rejects(first), assert.rejects(second)]);
    assert.equal(host.sessions.size, 0);
  }
});
