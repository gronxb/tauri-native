# Ordinary Tauri runtime fixture

This is the real-Tauri baseline for [M6 #41](https://github.com/gronxb/tauri-native/issues/41). It deliberately uses features rejected by the current extracted-command adapter: Builder setup, State, AppHandle, a Rust plugin with capabilities, async commands and Rust events. No RN/Lynx dependency or custom producer SDK is used.

Run it as an ordinary Tauri app with the pinned Rust/mobile toolchains:

```sh
npm install
npm run build
npm run tauri dev
# For mobile, use the normal Tauri platform scaffolds:
npm run tauri ios init
npm run tauri ios build -- --target aarch64-sim --debug
npm run tauri android init
npm run tauri android build -- --target aarch64 --debug --apk
```

The frontend executes assertions, reloads its WebView and confirms that Tauri state and plugin initialization survive. It displays and atomically saves a JSON result through AppHandle's ordinary app-data path. The denied plugin command has an observable counter, so a false rejection after execution cannot pass.

`nub --cwd packages/cli run test:runtime:baseline` builds and runs a disposable desktop copy with real Tauri/Wry and validates that report plus source hashes. Evidence is written to `target/tauri-mobile-runtime/desktop-report.json`. This gate requires Cargo in PATH and cached lockfile dependencies. It is a standalone baseline, not proof of RN/Lynx mobile composition. Native Swift/Kotlin plugins and renderer attachment belong to subsequent #41/#43 acceptance.

For standalone mobile execution, select a booted iOS simulator with `IOS_SIMULATOR_UDID` or an arm64 Android emulator with `ANDROID_SERIAL`, then run `test:runtime:ios` or `test:runtime:android` from the CLI package. Android additionally requires `adb` in PATH, `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME`; iOS requires Xcode and the standard Tauri mobile tools. The harness creates disposable standard mobile scaffolds, installs only its proof app, asserts the same report and uninstalls that app afterward. Debug simulator/emulator evidence is distinct from Release, physical-device and composed-host evidence.
