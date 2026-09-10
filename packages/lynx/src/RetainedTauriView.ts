import { createElement } from '@lynx-js/react';
import type { ViewProps } from '@lynx-js/types';

type Attachment = { type: string; code: string; message: string };
type NativeProps = Omit<ViewProps, 'children'> & {
  bindtauriattachment?: (event: { detail: Attachment }) => void;
};
declare module '@lynx-js/types' {
  interface IntrinsicElements { 'tauri-retained-view': NativeProps }
}

export type TauriViewProps = Omit<ViewProps, 'children'> & {
  onAttach?: () => void;
  onAttachError?: (error: { code: string; message: string }) => void;
};

/** Displays the original Tauri document. One view can attach per application. */
export function TauriView({ onAttach, onAttachError, ...view }: TauriViewProps) {
  return createElement('tauri-retained-view', { ...view,
    'native-interaction-enabled': true,
    bindtauriattachment: ({ detail }: { detail: Attachment }) => {
      if (detail.type === 'attached') onAttach?.();
      else onAttachError?.({ code: detail.code, message: detail.message });
    },
  });
}
