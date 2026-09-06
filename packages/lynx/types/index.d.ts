import type { ViewProps } from '@lynx-js/types';

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'tauri-view': ViewProps;
  }
}

export interface InvokeError {
  code: string;
  message: string;
}

export type InvokeResponse<T, E = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export { TauriNative } from '../generated/TauriNative';
export declare function invoke<T, E = unknown>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T, E>;
export declare function TauriView(
  props: ViewProps
): ReturnType<typeof import('@lynx-js/react').createElement>;
