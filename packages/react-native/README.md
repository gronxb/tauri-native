# @tauri-native/react-native

Experimental iOS and Android React Native bridge for a Tauri microfrontend and its Rust application core.

## Install

```sh
npm install @tauri-native/react-native@experimental
```

Install `@tauri-native/cli` in the separate Tauri project and export the platform artifacts there first:

```sh
npx tauri-native export ios
npx tauri-native export android
```

## Expo CNG

Add the config plugin to `app.json`. The `tauriDir` path is resolved from the Expo project root.

```json
{
  "expo": {
    "plugins": [
      [
        "@tauri-native/react-native",
        { "tauriDir": "../tauri/src-tauri" }
      ]
    ]
  }
}
```

Run `expo prebuild --platform ios` or `expo prebuild --platform android`. On iOS, the plugin copies the co-located export into an app-owned local Pod. On Android, it copies the four ABI libraries and web assets into `android/app/src/main` before Gradle autolinks this package.

## Bare React Native

Export the artifacts from the Tauri project for iOS:

```sh
cd ../tauri
npx tauri-native export ios \
  --output-dir ../react-native/ios/tauri-native
```

Then add the generated Pod before running `pod install`:

```ruby
pod 'TauriNativeGenerated', :path => './tauri-native'
```

For Android, run `tauri-native export android`, then copy the generated `jniLibs` and `assets/tauri-native` directories into the matching directories under the host's `android/app/src/main`.

## API

```tsx
import { TauriView, invoke } from '@tauri-native/react-native';

const response = invoke('calculate', { expression: '7 * (8 - 2)' });

<TauriView style={{ flex: 1 }} />;
```

The direct TurboModule API is synchronous on both iOS and Android.

## License

MIT
