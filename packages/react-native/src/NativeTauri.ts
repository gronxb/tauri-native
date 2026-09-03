import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Synchronous only for the PoC. Long-running commands must use an async API.
   */
  invoke(command: string, payloadJson: string): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TauriNative');
