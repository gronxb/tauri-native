import { TurboModuleRegistry } from 'react-native';
import type { Spec } from '../retained/specs/NativeTauriRuntime';
import { openSession, type RuntimeTransport } from './retained-client';
export type { RuntimeSession, RuntimeEvent, RuntimeFailure, InvokeResponse, InvokeRequest } from './retained-client';
export type { InvokeOptions } from './async-client';

const transport: RuntimeTransport = (operation, callback) => {
  const module = TurboModuleRegistry.getEnforcing<Spec>('TauriNativeRuntime');
  module.exchange(JSON.stringify(operation), json => callback(JSON.parse(json)));
};

/** The original Tauri app owns commands, state, permissions and native plugins. */
export function openTauriSession(caller: string) { return openSession(transport, caller); }
