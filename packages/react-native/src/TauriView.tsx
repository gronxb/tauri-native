import type { ViewProps } from 'react-native';
import type { ViewOptions } from './view-options';

export type TauriViewProps = ViewProps & ViewOptions;

export function TauriView(_props: TauriViewProps): never {
  throw new Error("'@tauri-native/react-native' is only supported on native platforms");
}
