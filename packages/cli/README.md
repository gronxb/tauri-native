# @tauri-native/cli

Experimental CLI for packaging a Tauri microfrontend and its Rust application core for an iOS host.

## Install

```sh
npm install --save-dev @tauri-native/cli@experimental
```

Node.js 22.12 or newer, Rust with the iOS targets, and Xcode are required.

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

## License

MIT
