# @tauri-native/cli

Experimental CLI for packaging a Tauri microfrontend and its Rust application core for an iOS host.

## Install

```sh
npm install --save-dev @tauri-native/cli@experimental
```

Node.js 22.12 or newer, Rust with the iOS targets, and Xcode are required.

## Build for iOS

```sh
npx tauri-native build ios \
  --tauri-dir ../tauri/src-tauri \
  --output-dir ios/tauri-native
```

The Tauri directory must contain `tauri.conf.json`. By default, the command builds `crates/app-core/Cargo.toml`, uses `crates/app-core/include/tauri_native.h`, and reads the configured `build.frontendDist`.

The output directory contains:

- `TauriNativeCore.xcframework`
- `TauriNativeAssets.bundle`
- `TauriNativeGenerated.podspec`

Add the generated local Pod to the native host's Podfile before installing `@tauri-native/react-native` or `@tauri-native/lynx`.

## License

MIT
