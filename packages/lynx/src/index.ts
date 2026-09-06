import { createElement } from '@lynx-js/react';
import type { ViewProps } from '@lynx-js/types';

type GeneratedTauriNative =
  typeof import('../generated/TauriNative.js').TauriNative;

declare const NativeModules: {
  TauriNative: GeneratedTauriNative;
};

export interface InvokeError {
  code: string;
  message: string;
}

export type InvokeResponse<T, E = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const TauriNative = {
  invoke(command: string, payloadJson: string) {
    return NativeModules.TauriNative.invoke(command, payloadJson);
  },
} satisfies GeneratedTauriNative;

export function invoke<T, E = unknown>(
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
