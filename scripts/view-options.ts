export interface ViewMessage { id: string; event: string; payload?: unknown }
export interface ViewOptions {
  /** Local packaged path, query and fragment. A change loads a fresh document. */
  path?: string;
  /** Send after ready. A new id sends once; messages are not replayed on navigation. */
  message?: ViewMessage;
  onLoadStart?: (value: { url: string }) => void;
  onReady?: (value: { url: string }) => void;
  onLoadError?: (value: { url: string; code: string; message: string }) => void;
  onEvent?: (value: { event: string; payload: unknown }) => void;
}

export interface ViewState { type: string; url: string; code: string; message: string; event: string; payload: string }

export function dispatchViewState(options: ViewOptions, state: ViewState): void {
  switch (state.type) {
    case 'loadstart': options.onLoadStart?.({ url: state.url }); break;
    case 'ready': options.onReady?.({ url: state.url }); break;
    case 'error': options.onLoadError?.({ url: state.url, code: state.code, message: state.message }); break;
    case 'event': options.onEvent?.({ event: state.event, payload: JSON.parse(state.payload) }); break;
  }
}
