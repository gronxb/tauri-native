export interface BridgeMessage {
  type: string;
  document?: string | undefined;
  id?: string;
  command?: string;
  event?: string;
  payload?: unknown;
}
export interface BridgeEvent { event: string; id: number; payload: unknown }
export interface EventPayload {
  event?: string;
  eventId?: number;
  target?: { kind?: string; label?: string };
  handler?: number;
  payload?: unknown;
  directory?: number;
}
export interface TauriInternals {
  transformCallback(callback: (event: BridgeEvent) => void, once?: boolean): number;
  unregisterCallback(id: number): boolean;
  invoke(command: string, payload?: EventPayload | Record<string, unknown>): Promise<unknown>;
}
export interface WebViewBridge {
  __RNTauriResolve(document: string, id: string, responseJson?: string, failure?: string): void;
  __RNTauriDrain(document: string, responseJson: string): void;
  __RNTauriSuspend(): void;
  __RNTauriResume(): void;
  __RNTauriHostEvent(document: string, event: string, payload?: unknown): string;
  __TAURI_NATIVE_HOST__: string;
  __TAURI_INTERNALS__: TauriInternals;
  __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener(event: string, id: number): void };
}
declare global {
  interface Window extends WebViewBridge {}
  var isTauri: boolean;
  const __TAURI_NATIVE_POST_MESSAGE__: void;
}
