import { openSession, type RuntimeTransport } from './retained-client';
export type { RuntimeSession, RuntimeEvent, RuntimeFailure, InvokeResponse, InvokeRequest } from './retained-client';
export type { InvokeOptions } from './async-client';

declare const NativeModules: {
  TauriNativeRuntime?: { exchange(operation: string, callback: (response: string) => void): void };
};

const transport: RuntimeTransport = (operation, callback) => {
  'background only';
  const module = NativeModules.TauriNativeRuntime;
  if (!module) throw new Error('Mount this renderer with the retained Tauri Lynx host before opening a session');
  module.exchange(JSON.stringify(operation), json => callback(JSON.parse(json)));
};

/** Call from a Lynx background event/effect. The original Tauri app owns all state. */
export function openTauriSession(caller: string) {
  'background only';
  return openSession(transport, caller);
}
