// Host-owned acceptance screen logic, copied into the independent RN/Lynx QA hosts.
type Response = { ok: boolean; value?: any; error?: any };
type Request = Promise<Response> & { cancel(): void };
type Invoke = (command: string, payload: Record<string, unknown>) => Request;
type InvokeSync = (command: string, payload: Record<string, unknown>) => Response;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

export function asyncContract(invoke: Invoke, invokeSync: InvokeSync, status: (message: string) => void) {
  const work = () => {
    const result = invokeSync('work_status', {});
    assert(result.ok, 'Status command failed');
    return result.value as Record<string, { started: number; completed: number }>;
  };
  const until = async (condition: () => boolean, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    while (!condition()) { assert(Date.now() < deadline, 'Work did not reach its expected state'); await pause(16); }
  };
  const cancelled = (request: Request) => request.then(
    () => { throw new Error('Cancelled work resolved'); },
    error => { assert(error.name === 'AbortError', 'Cancellation must reject with AbortError'); },
  );
  let uiRequest: Request | undefined;
  let uiRunning = false;
  let pulses = 0;

  async function check() {
    const previous = work();
    if (previous['runtime-a']) {
      assert(previous['runtime-a'].completed === 0 && previous['runtime-b']?.completed === 0, 'The new runtime must start while old Rust work is still running');
      assert(!previous['runtime-queued'], 'Retired runtime queued work must not execute');
      status('Runtime restarted while Rust work is pending');
      await until(() => work()['runtime-a']?.completed === 1 && work()['runtime-b']?.completed === 1, 25000);
      assert(!work()['runtime-queued'], 'Runtime teardown must remove queued work');
      const fresh = await invoke('delayed', { label: 'runtime-fresh', milliseconds: 1 });
      assert(fresh.ok && fresh.value === 'runtime-fresh', 'The replacement runtime must receive its own results');
      status('Runtime reload passed');
      return;
    }
    const order: string[] = [];
    const slow = invoke('held', { label: 'direct-slow' }).then(result => { assert(result.ok && result.value === 'direct-slow', 'Slow routing'); order.push('slow'); });
    try {
      const fast = await invoke('delayed', { label: 'direct-fast', milliseconds: 1 });
      assert(fast.ok && fast.value === 'direct-fast', 'Fast routing');
      order.push('fast');
      assert(work()['direct-slow']?.completed !== 1, 'Fast work must finish while slow work is held');
    } finally { invokeSync('release', { label: 'direct-slow' }); }
    await slow;
    assert(order.join() === 'fast,slow', 'Calls must execute concurrently');
    const error = await invoke('domain_failure', {});
    assert(!error.ok && error.error.kind === 'expected_failure', 'Preserve domain errors');
    const unit = await invoke('nothing', {});
    assert(unit.ok && unit.value === null, 'Preserve unit results');
    const a = invoke('blocking', { label: 'cancel-a', milliseconds: 500 });
    const b = invoke('delayed', { label: 'cancel-b', milliseconds: 500 });
    await until(() => work()['cancel-a']?.started === 1 && work()['cancel-b']?.started === 1);
    const queued = invoke('blocking', { label: 'cancel-queued', milliseconds: 0 });
    const rejected = [cancelled(a), cancelled(b), cancelled(queued)];
    queued.cancel(); a.cancel(); b.cancel(); queued.cancel();
    await Promise.all(rejected);
    await until(() => work()['cancel-a']?.completed === 1 && work()['cancel-b']?.completed === 1);
    assert(!work()['cancel-queued'], 'Queued cancellation must prevent the side effect');
    status('Native async contract passed');
  }

  return {
    check,
    async startUi() {
      uiRunning = true;
      uiRequest = invoke('blocking', { label: 'ui-blocking', milliseconds: 12000 });
      const completion = cancelled(uiRequest);
      await until(() => work()['ui-blocking']?.started === 1);
      status('Native work running');
      await completion;
      uiRunning = false;
      status('Native cancellation passed');
    },
    pulse() { status(`Native pulse: ${++pulses}; running: ${uiRunning}`); },
    cancelUi() { uiRequest?.cancel(); },
    async retiredFrontend() {
      const labels = Object.keys(work()).filter(label => label.startsWith('web-retired:'));
      assert(labels.length > 0 && labels.some(label => work()[label]?.completed === 0), 'The view must unmount while its Rust work is pending');
      status('Unmounted with frontend work pending');
      await until(() => labels.every(label => work()[label]?.completed === 1), 15000);
      status('Retired frontend work completed');
    },
    async startRuntime() {
      // These requests deliberately outlive the old JS runtime. No JS cleanup cancels them.
      for (const label of ['runtime-a', 'runtime-b']) void invoke('blocking', { label, milliseconds: 20000 }).catch(() => {});
      await until(() => work()['runtime-a']?.started === 1 && work()['runtime-b']?.started === 1);
      void invoke('blocking', { label: 'runtime-queued', milliseconds: 0 }).catch(() => {});
      status('Runtime work pending');
    },
  };
}
