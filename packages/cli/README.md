# @tauri-native/cli

Experimental CLI for packaging a Tauri microfrontend and its Rust application core for iOS and Android hosts.

## Install

```sh
npm install --save-dev @tauri-native/cli@experimental
```

Node.js 22.12 or newer and Rust are required. iOS exports require Xcode and the iOS Rust targets. Android exports require the Android NDK and [`cargo-ndk`](https://github.com/bbqsrc/cargo-ndk):

```sh
cargo install cargo-ndk --locked
```

Install the package in the Tauri project that owns the frontend and Rust core. React Native and Lynx hosts consume its exported artifacts and do not need the CLI as a dependency.

## Export for iOS

```sh
npx tauri-native export ios
```

Run this from the Tauri project root. By default, the command reads `src-tauri/tauri.conf.json`, builds `src-tauri/crates/app-core/Cargo.toml`, uses `src-tauri/crates/app-core/include/tauri_native.h`, and writes the co-located export to `src-tauri/gen/tauri-native/ios`. Use `--tauri-dir`, `--manifest`, or `--header` when the project uses another layout.

Pass `--output-dir` to export directly into a native host instead:

```sh
npx tauri-native export ios \
  --output-dir ../mobile-app/ios/tauri-native
```

The output directory contains:

- `TauriNativeCore.xcframework`
- `TauriNativeAssets.bundle`
- `TauriNativeGenerated.podspec`

Copy or reference the exported directory from the native host, then add its generated local Pod before installing native dependencies.

## Export for Android

The Rust library must include both mobile crate types:

```toml
[lib]
crate-type = ["staticlib", "cdylib"]
```

Run the Android export from the Tauri project root:

```sh
npx tauri-native export android
```

The default output is `src-tauri/gen/tauri-native/android` and contains:

- `jniLibs/<abi>/libtauri_native_core.so` for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`
- `assets/tauri-native` containing the unchanged frontend distribution

The React Native Expo config plugin installs these files during Android prebuild. Bare React Native and Lynx hosts can copy both directories into `android/app/src/main` or reference them from the app source set.

## License

MIT
