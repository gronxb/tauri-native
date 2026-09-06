import NativeTauri from './NativeTauri';
import { createInvoker, type InvokeResponse } from './async-client';
export type { InvokeError, InvokeResponse, InvokeOptions, InvokeRequest } from './async-client';

export const invoke = createInvoker(NativeTauri);

/** Blocking compatibility path for legacy artifacts and short commands. */
export function invokeSync<T, E = unknown>(
  command: string,
  payload: Record<string, unknown>
): InvokeResponse<T, E> {
  return JSON.parse(
    NativeTauri.invoke(command, JSON.stringify(payload))
  ) as InvokeResponse<T, E>;
}
