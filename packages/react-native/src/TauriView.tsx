import type { ViewProps } from 'react-native';

export type TauriViewProps = ViewProps & {
};

export function TauriView(_props: TauriViewProps): never {
  throw new Error("'@tauri-native/react-native' is only supported on native platforms");
}
