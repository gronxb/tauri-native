# @tauri-native/cli

Experimental CLI for packaging a Tauri microfrontend and its Rust application core for an iOS host.

## Install

```sh
npm install --save-dev @tauri-native/cli@experimental
```

Node.js 22.12 or newer, Rust with the iOS targets, and Xcode are required.

Install the package in the React Native or Lynx host project. The Tauri project stays independent and does not need this CLI as a dependency.

## Build for iOS

```sh
npx tauri-native build ios \
  --tauri-dir ../tauri-app/src-tauri \
  --output-dir ios/tauri-native
```

Run this from the native host project. `--tauri-dir` points to the existing Tauri project's `src-tauri` directory, which must contain `tauri.conf.json`. By default, the command builds `crates/app-core/Cargo.toml`, uses `crates/app-core/include/tauri_native.h`, and reads the configured `build.frontendDist`. Use `--manifest` and `--header` when the existing Tauri project uses another Rust layout.

The output directory contains:

- `TauriNativeCore.xcframework`
- `TauriNativeAssets.bundle`
- `TauriNativeGenerated.podspec`

Add the generated local Pod to the native host's Podfile before installing `@tauri-native/react-native` or `@tauri-native/lynx`.

## License

MIT
