# @tauri-native/lynx

Experimental Lynx native library for `tauri-native`.

## Install

```sh
npm install @tauri-native/lynx@experimental
```

Install `@tauri-native/cli` in the separate Tauri project and export the app-specific artifacts there before building the host:

```sh
cd ../tauri
npx tauri-native export ios
npx tauri-native export android
```

For iOS, add the co-located export as a local Pod before calling `use_lynx_library!`:

```ruby
export_dir = File.expand_path('../../tauri-app/src-tauri/gen/tauri-native/ios', __dir__)
pod 'TauriNativeGenerated', :path => export_dir
```

For Android, enable the Lynx 4.0.1 Native Library plugins in the host, then add the export directories to the application source set:

```groovy
// settings.gradle
plugins {
  id 'org.lynxsdk.lynx.library-settings' version '4.0.1'
}

// app/build.gradle
plugins {
  id 'com.android.application'
  id 'org.lynxsdk.lynx.library-build'
}

android.sourceSets.main {
  assets.srcDir '../../../tauri-app/src-tauri/gen/tauri-native/android/assets'
  jniLibs.srcDir '../../../tauri-app/src-tauri/gen/tauri-native/android/jniLibs'
}
```

## API

```tsx
import { TauriView, invoke } from '@tauri-native/lynx';

const result = invoke<Calculation>('calculate', {
  expression: '(9 + 5) * 3',
});

<TauriView style={{ height: '420px' }} />;
```

The package follows the official Lynx Native Library layout. It exposes a typed native module for direct Rust invocation and a `tauri-view` custom native element backed by Swift `WKWebView` on iOS and Android `WebView` on Android.

The example hosts initialize `LynxEnv`, load the local `main.lynx.bundle` through a template provider, and render a `LynxView` as described by Lynx's existing-app guides. iOS uses CocoaPods and Android uses the Native Library Gradle plugins for [autolinking](https://lynxjs.org/guide/autolink). Both include `XElement` because the example renders a native `<input>`.

This package is experimental and supports iOS and Android. See the root README for the complete build and integration contract.

## License

MIT
