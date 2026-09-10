import type { ViewProps } from 'react-native';
import NativeTauriView from '../retained/specs/TauriRetainedViewNativeComponent';

export interface TauriViewProps extends Omit<ViewProps, 'children'> {
  onAttach?: () => void;
  onAttachError?: (error: { code: string; message: string }) => void;
}

/** Displays the original Tauri document without creating or reloading its WebView. */
export function TauriView({ onAttach, onAttachError, ...view }: TauriViewProps) {
  return <NativeTauriView {...view} onTauriAttachment={({ nativeEvent }) => {
    if (nativeEvent.type === 'attached') onAttach?.();
    else onAttachError?.({ code: nativeEvent.code, message: nativeEvent.message });
  }} />;
}
