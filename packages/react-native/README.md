# @tauri-native/react-native

Experimental iOS React Native bridge for a Tauri microfrontend and its Rust application core.

## Install

```sh
npm install @tauri-native/react-native@experimental
```

Install `@tauri-native/cli` in the separate Tauri project and run `tauri-native export ios` there first.

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

Run `expo prebuild --platform ios`. The plugin copies the Tauri project's co-located `src-tauri/gen/tauri-native/ios` export into an app-owned `ios/tauri-native` local Pod and adds it to the generated Podfile before CocoaPods autolinks this package.

## Bare React Native

Export the artifacts from the Tauri project:

```sh
cd ../tauri
npx tauri-native export ios \
  --output-dir ../react-native/ios/tauri-native
```

Then add the generated Pod before running `pod install`:

```ruby
pod 'TauriNativeGenerated', :path => './tauri-native'
```

## API

```tsx
import { TauriView, invoke } from '@tauri-native/react-native';

const response = invoke('calculate', { expression: '7 * (8 - 2)' });

<TauriView style={{ flex: 1 }} />;
```

The direct JSI API is synchronous and currently supports iOS only.

## License

MIT
