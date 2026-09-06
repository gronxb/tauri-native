import NativeTauri from './NativeTauri';

export interface InvokeError {
  code: string;
  message: string;
}

export type InvokeResponse<T, E = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function invoke<T, E = unknown>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T, E> {
  return JSON.parse(
    NativeTauri.invoke(command, JSON.stringify(payload))
  ) as InvokeResponse<T, E>;
}
