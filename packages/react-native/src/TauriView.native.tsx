import type { ViewProps } from 'react-native';

import NativeTauriView from './TauriViewNativeComponent';
import { dispatchViewState, type ViewOptions } from './view-options';

export type TauriViewProps = ViewProps & ViewOptions;

/**
 * A Fabric-owned native WebView that loads the packaged Tauri microfrontend.
 * It supports only the documented invoke and view-scoped event subset.
 */
export function TauriView(props: TauriViewProps) {
  const { message, onLoadStart, onReady, onLoadError, onEvent, ...view } = props;
  return <NativeTauriView {...view} messageJson={JSON.stringify(message) ?? ''}
    onTauriState={event => dispatchViewState(props, event.nativeEvent)} />;
}
