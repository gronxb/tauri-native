// Shared native QA scenario; each host renders the same public view props.
type Side = 'left' | 'right';
type Message = { id: string; event: string; payload: unknown };
const slot = (side: Side) => ({ path: `/index.html?documentId=${side}#details`, mounted: true, message: undefined as Message | undefined,
  starts: 0, ready: 0, replies: 0, last: 'none', error: 'none', detail: '', fixture: 'waiting' });
export const initialViewState = () => ({ left: slot('left'), right: slot('right'), failure: '' });

export function viewContract(update: (state: ReturnType<typeof initialViewState>) => void) {
  const state = initialViewState();
  let sequence = 0;
  const publish = () => update({ ...state, left: { ...state.left }, right: { ...state.right } });
  const fail = (message: string) => { state.failure = `FAILED: ${message}`; };
  return {
    options(side: Side) {
      const current = state[side];
      return {
        path: current.path, message: current.message,
        onLoadStart: () => { current.starts++; publish(); },
        onReady: ({ url }: { url: string }) => {
          current.ready++;
          if (current.ready > current.starts) fail(`${side} ready without load start`);
          if (!url.endsWith(current.path)) fail(`${side} ready URL: ${url}`);
          publish();
        },
        onLoadError: ({ code, url, message }: { code: string; url: string; message: string }) => { current.error = code; current.detail = `${url} ${message}`; publish(); },
        onEvent: ({ event, payload }: { event: string; payload: unknown }) => {
          if (event !== 'reply' && event !== 'fixture-ready') return;
          const result = payload as { documentId: string; fragment: string; passed: boolean; messages: number; payload: { text: string; nested: unknown[] } };
          const expected = side === 'right' ? 'right' : current.path.includes('documentId=next') ? 'next' : 'left';
          if (result.documentId !== expected) fail(`${side} received ${result.documentId}`);
          if (result.fragment !== (expected === 'next' ? '#fresh' : '#details')) fail(`${side} lost fragment`);
          if (event === 'fixture-ready') {
            if (!result.passed) fail(`${side} standard event proof`);
            current.fixture = result.documentId;
          } else {
            if (result.payload.text !== '한글 🦀' || JSON.stringify(result.payload.nested) !== '[1,true,null]') fail(`${side} payload mismatch`);
            current.replies++;
            current.last = `${result.documentId}/${result.messages}`;
          }
          publish();
        },
      };
    },
    send(side: Side, duplicate = false) {
      const current = state[side];
      current.message = { id: duplicate ? current.message!.id : String(++sequence), event: 'host-update',
        payload: { text: duplicate ? 'duplicate must not deliver' : '한글 🦀', nested: [1, true, null] } };
      publish();
    },
    navigate(path: string) { state.left.path = path; state.left.error = 'none'; publish(); },
    toggle() {
      state.left.mounted = !state.left.mounted;
      state.left.message = undefined;
      state.left.path = '/index.html?documentId=left#details';
      publish();
    },
  };
}
