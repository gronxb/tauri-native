import type { ViewProps } from '@lynx-js/types';

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'tauri-view': ViewProps;
  }
}

export * from '../src/index';
