import { createElement } from '@lynx-js/react';
import type { ViewProps } from '@lynx-js/types';
import { dispatchViewState, type ViewOptions, type ViewState } from './view-options';

export type TauriViewProps = ViewProps & ViewOptions;
export type NativeViewProps = ViewProps & {
  path?: string;
  'message-json'?: string;
  bindtauristate?: (event: { detail: ViewState }) => void;
};

export function TauriView(props: TauriViewProps) {
  const { message, onLoadStart, onReady, onLoadError, onEvent, ...view } = props;
  return createElement('tauri-view', { ...view, 'message-json': JSON.stringify(message) ?? '',
    bindtauristate: (event: { detail: ViewState }) => dispatchViewState(props, event.detail) });
}
