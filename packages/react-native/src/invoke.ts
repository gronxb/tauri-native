import NativeTauri from './NativeTauri';

export interface InvokeError {
  code: string;
  message: string;
}

export type InvokeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: InvokeError };

export function invoke<T>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T> {
  return JSON.parse(
    NativeTauri.invoke(command, JSON.stringify(payload))
  ) as InvokeResponse<T>;
}
