import type { InvokeOptions } from './async-client';

export interface RuntimeFailure<E = unknown> { ok: false; code?: string; error: E }
export type InvokeResponse<T, E = unknown> = { ok: true; value: T } | RuntimeFailure<E>;
export type InvokeRequest<T, E = unknown> = Promise<InvokeResponse<T, E>> & { cancel(): void };
export interface RuntimeEvent<T = unknown> { subscription: number; event: string; payload: T }
type Reply = RuntimeFailure | { ok: true; [key: string]: unknown };
export type RuntimeTransport = (operation: Record<string, unknown>, callback: (response: Reply) => void) => void;
export interface RuntimeSession {
  invoke<T, E = unknown>(command: string, payload: Record<string, unknown>, options?: InvokeOptions): InvokeRequest<T, E>;
  /** onError receives stream errors; refetch after event_overflow or invalid_event_payload. */
  listen<T = unknown>(event: string, callback: (event: RuntimeEvent<T>) => void, onError: (error: RuntimeFailure) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

function failure(code: string, message = code) { return Object.assign(new Error(message), { code }); }
function requireSuccess(reply: Reply) {
  if (!reply.ok) throw failure(reply.code ?? 'runtime_error', typeof reply.error === 'string' ? reply.error : JSON.stringify(reply.error));
  return reply;
}
function exchange(native: RuntimeTransport, operation: Record<string, unknown>) {
  return new Promise<Reply>((resolve, reject) => { try { native(operation, resolve); } catch (error) { reject(error); } });
}

/** Each renderer session owns its commands and subscriptions until explicit close or native teardown. */
export async function openSession(native: RuntimeTransport, caller: string): Promise<RuntimeSession> {
  const status = requireSuccess(await exchange(native, { op: 'status' }));
  if (status.status !== 'ready') throw failure('runtime_not_ready', `Tauri runtime is ${status.status}`);
  if (!Array.isArray(status.features) || !status.features.includes('events')) throw failure('incompatible_runtime', 'Export retained Tauri artifacts with native event support');
  const opened = requireSuccess(await exchange(native, { op: 'open', caller }));
  const session = opened.session;
  const pending = new Map<string, (error: Error) => void>();
  const listeners = new Map<number, { callback(event: RuntimeEvent): void; onError(error: RuntimeFailure): void }>();
  let next = 0, registrations = 0;
  let closed = false, polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let held: Reply | undefined;
  let closing: Promise<void> | undefined;

  function request(operation: Record<string, unknown>, options: InvokeOptions = {}): InvokeRequest<unknown> {
    const id = String(++next);
    let cancel = () => {};
    const promise = new Promise<InvokeResponse<unknown>>((resolve, reject) => {
      if (closed || options.signal?.aborted) { reject(failure(closed ? 'session_closed' : 'request_cancelled')); return; }
      const finish = (reply?: Reply, error?: Error) => {
        if (!pending.delete(id)) return;
        options.signal?.removeEventListener('abort', cancel);
        if (error) reject(error); else resolve(reply as InvokeResponse<unknown>);
      };
      pending.set(id, error => finish(undefined, error));
      cancel = () => {
        if (!pending.has(id)) return;
        finish(undefined, failure('request_cancelled'));
        void exchange(native, { op: 'cancel', session, id }).catch(() => {});
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      exchange(native, { ...operation, session, id }).then(reply => finish(reply), error => finish(undefined, error));
    });
    return Object.assign(promise, { cancel: () => cancel() });
  }

  function schedule() {
    if (closed || polling || registrations || held || timer !== undefined || !listeners.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (closed || registrations || !listeners.size) return;
      polling = true;
      exchange(native, { op: 'events', session }).then(reply => {
        polling = false;
        // A subscription can emit before its acknowledgement reaches JS. Hold
        // the in-flight batch until every registration has a JS listener.
        held = reply;
        deliver();
      }, error => {
        polling = false;
        held = { ok: false, code: 'transport_error', error: String(error) };
        deliver();
      });
    }, 16);
  }

  function deliver() {
    if (closed) { held = undefined; return; }
    if (registrations || !held) { schedule(); return; }
    const batch = held; held = undefined;
    try {
      if (batch.ok) {
        for (const event of batch.events as RuntimeEvent[]) listeners.get(event.subscription)?.callback(event);
      } else {
        for (const listener of [...listeners.values()]) listener.onError(batch);
        if (!['event_overflow', 'invalid_event_payload'].includes(batch.code ?? '')) void close();
      }
    } finally { schedule(); }
  }

  function close() {
    if (closing) return closing;
    closed = true;
    clearTimeout(timer); timer = undefined; held = undefined; listeners.clear();
    for (const settle of [...pending.values()]) settle(failure('session_closed'));
    closing = exchange(native, { op: 'close', session }).then(requireSuccess).then(() => {});
    return closing;
  }

  return {
    invoke: <T, E = unknown>(command: string, payload: Record<string, unknown>, options?: InvokeOptions) =>
      request({ op: 'invoke', command, payload }, options) as InvokeRequest<T, E>,
    async listen<T>(event: string, callback: (event: RuntimeEvent<T>) => void, onError: (error: RuntimeFailure) => void) {
      registrations++;
      try {
        const reply = requireSuccess(await request({ op: 'listen', event }) as Reply);
        if (closed) throw failure('session_closed');
        const subscription = reply.subscription as number;
        listeners.set(subscription, { callback: callback as (event: RuntimeEvent) => void, onError });
        let removing: Promise<void> | undefined;
        return () => {
          listeners.delete(subscription);
          if (!removing) removing = closed ? Promise.resolve() : exchange(native, { op: 'unlisten', session, subscription }).then(requireSuccess).then(() => {});
          return removing;
        };
      } finally { registrations--; deliver(); }
    },
    close,
  };
}
