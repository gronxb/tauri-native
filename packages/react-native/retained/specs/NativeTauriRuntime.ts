import { TurboModuleRegistry, type TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  exchange(operation: string, callback: (response: string) => void): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('TauriNativeRuntime');
