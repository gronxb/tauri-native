import { createElement } from '@lynx-js/react';
import type { ViewProps } from '@lynx-js/types';
import { createInvoker, type InvokeResponse } from './async-client';
export type { InvokeError, InvokeResponse, InvokeOptions, InvokeRequest } from './async-client';

type GeneratedTauriNative =
  typeof import('../generated/TauriNative.js').TauriNative;

declare const NativeModules: {
  TauriNative: GeneratedTauriNative;
};

export const TauriNative = {
  invoke(command: string, payloadJson: string) {
    return NativeModules.TauriNative.invoke(command, payloadJson);
  },
  createSession() { return NativeModules.TauriNative.createSession(); },
  start(session: string, id: string, command: string, payload: string) { return NativeModules.TauriNative.start(session, id, command, payload); },
  poll(session: string) { return NativeModules.TauriNative.poll(session); },
  cancel(session: string, id: string) { NativeModules.TauriNative.cancel(session, id); },
  closeSession(session: string) { NativeModules.TauriNative.closeSession(session); },
} satisfies GeneratedTauriNative;

export const invoke = createInvoker(TauriNative);

/** Blocking compatibility path for legacy artifacts and short commands. */
export function invokeSync<T, E = unknown>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T, E> {
  return JSON.parse(
    TauriNative.invoke(command, JSON.stringify(payload))
  ) as InvokeResponse<T, E>;
}

export function TauriView(props: ViewProps) {
  return createElement('tauri-view', props);
}
