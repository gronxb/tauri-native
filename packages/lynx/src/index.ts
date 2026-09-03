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

export type InvokeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: InvokeError };

export const TauriNative = {
  invoke(command: string, payloadJson: string) {
    return NativeModules.TauriNative.invoke(command, payloadJson);
  },
} satisfies GeneratedTauriNative;

export function invoke<T>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T> {
  return JSON.parse(
    TauriNative.invoke(command, JSON.stringify(payload))
  ) as InvokeResponse<T>;
}

export function TauriView(props: ViewProps) {
  return createElement('tauri-view', props);
}
