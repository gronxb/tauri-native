import type { NativeViewProps } from '../src/TauriView';

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'tauri-view': NativeViewProps;
  }
}

export * from '../src/index';
