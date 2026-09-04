import type { ComponentProps } from 'react';

import NativeTauriView from './TauriViewNativeComponent';

export type TauriViewProps = ComponentProps<typeof NativeTauriView>;

/**
 * A Fabric-owned native WebView that loads the packaged Tauri microfrontend.
 * It does not embed tauri::App or provide Tauri plugin/API compatibility.
 */
export function TauriView(props: TauriViewProps) {
  return <NativeTauriView {...props} />;
}
