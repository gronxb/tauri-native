import type { ViewProps } from '@lynx-js/types';

export interface InvokeError {
  code: string;
  message: string;
}

export type InvokeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: InvokeError };

export { TauriNative } from '../generated/TauriNative';
export declare function invoke<T>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T>;
export declare function TauriView(
  props: ViewProps
): ReturnType<typeof import('@lynx-js/react').createElement>;
