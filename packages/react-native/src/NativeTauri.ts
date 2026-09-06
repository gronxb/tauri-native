import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  /** Legacy blocking entry point, exposed publicly as invokeSync. */
  invoke(command: string, payloadJson: string): string;
  createSession(): string;
  start(session: string, id: string, command: string, payload: string): string;
  poll(session: string): string;
  cancel(session: string, id: string): void;
  closeSession(session: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TauriNative');
