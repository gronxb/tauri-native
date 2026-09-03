# @tauri-native/lynx

Experimental Lynx native library for `tauri-native`.

```tsx
import { TauriView, invoke } from '@tauri-native/lynx';

const result = invoke<Calculation>('calculate', {
  expression: '(9 + 5) * 3',
});

<TauriView style={{ height: '420px' }} />;
```

The package follows the official Lynx Native Library layout. It exposes a typed native module for direct Rust invocation and a `tauri-view` custom native element backed by Swift `WKWebView` on iOS.

The example host initializes `LynxEnv`, loads its local `main.lynx.bundle` through a `LynxTemplateProvider`, and renders a `LynxView` as described by Lynx's [existing-app iOS guide](https://lynxjs.org/guide/start/integrate-with-existing-apps?platform=ios). Its Podfile uses `use_lynx_library!` for [autolinking](https://lynxjs.org/guide/autolink) and includes `XElement` because the example renders a native `<input>`.

This package is not published and currently supports only the repository PoC. See the root README for build and integration instructions.
