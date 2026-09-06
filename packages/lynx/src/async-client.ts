export interface InvokeError { code: string; message: string }
export type InvokeResponse<T, E = unknown> = { ok: true; value: T } | { ok: false; error: E };
export interface InvokeOptions { signal?: AbortSignal }
export type InvokeRequest<T, E = unknown> = Promise<InvokeResponse<T, E>> & { cancel(): void };

export interface NativeTransport {
  createSession(): string;
  start(session: string, id: string, command: string, payload: string): string;
  poll(session: string): string;
  cancel(session: string, id: string): void;
  closeSession(session: string): void;
}

const failure = (code: string) => Object.assign(new Error(`tauri-native: ${code}`), { code, name: code === 'cancelled' ? 'AbortError' : 'Error' });

// Each busy client owns a session; idle clients release it. Native module
// teardown also closes outstanding sessions if JavaScript can no longer run.
export function createInvoker(native: NativeTransport) {
  const pending = new Map<string, { resolve(value: InvokeResponse<unknown>): void; reject(error: unknown): void; cleanup(): void }>();
  let session = '';
  let nextId = 1;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function finish(id: string, response?: InvokeResponse<unknown>, error?: unknown) {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.cleanup();
    if (error !== undefined) request.reject(error); else request.resolve(response!);
    if (!pending.size) {
      clearTimeout(timer); timer = undefined;
      const closed = session; session = '';
      // A disposed native runtime has already closed its sessions.
      if (closed) { try { native.closeSession(closed); } catch {} }
    }
  }

  function schedule() {
    if (!pending.size || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        const batch = JSON.parse(native.poll(session));
        if (!Array.isArray(batch)) throw failure(batch?.error ?? 'invalid_response');
        for (const item of batch) {
          if (!pending.has(item.id)) continue; // A cancelled result may already have been drained.
          const response = JSON.parse(item.response);
          if (response?.abiVersion !== 2 || typeof response.ok !== 'boolean' || !((response.ok ? 'value' : 'error') in response)) throw failure('invalid_response');
          finish(item.id, response);
        }
      } catch (error) {
        for (const id of [...pending.keys()]) finish(id, undefined, error);
      }
      schedule();
    }, 16);
  }

  return function invoke<T, E = unknown>(command: string, payload: Record<string, unknown>, options: InvokeOptions = {}): InvokeRequest<T, E> {
    let cancel = () => {};
    const promise = new Promise<InvokeResponse<unknown>>((resolve, reject) => {
      const signal = options.signal;
      if (signal?.aborted) { reject(failure('cancelled')); return; }
      let id: string | undefined;
      try {
        const json = JSON.stringify(payload);
        if (!session) {
          session = native.createSession();
          if (!session) throw failure('incompatible_abi: export ABI 2 artifacts with the CLI');
        }
        id = String(nextId++);
        const requestId = id;
        cancel = () => {
          if (!pending.has(requestId)) return;
          try { native.cancel(session, requestId); } catch {}
          finally { finish(requestId, undefined, failure('cancelled')); }
        };
        pending.set(id, { resolve, reject, cleanup: () => signal?.removeEventListener('abort', cancel) });
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) cancel();
        if (!pending.has(id)) return;
        const acknowledgement = native.start(session, id, command, json);
        if (acknowledgement) throw failure(JSON.parse(acknowledgement).error ?? 'invalid_response');
        schedule();
      } catch (error) {
        if (id && pending.has(id)) finish(id, undefined, error); else reject(error);
      }
    });
    return Object.assign(promise, { cancel: () => cancel() }) as InvokeRequest<T, E>;
  };
}
