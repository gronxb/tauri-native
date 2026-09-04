# ADR 0003: Android hosts share app-owned export artifacts

- Status: accepted for the Android proof of concept
- Date: 2026-09-04

## Context

The React Native and Lynx integrations need the same two Android paths already proven on iOS:

- React Native JavaScript calls the shared Rust core directly through the generated `TauriNative` TurboModule.
- A Fabric `TauriView` loads the packaged Tauri frontend and preserves its existing `@tauri-apps/api/core.invoke` call.
- Lynx JavaScript calls the core through its generated `TauriNative` module, while the `tauri-view` custom element embeds the same frontend.

Each mobile application must remain a conventional host, while the Tauri project continues to own its web frontend and application-specific Rust core. Android support must not initialize a second Tauri application runtime or publish one application's Rust code inside either reusable npm bridge package.

## Options considered

### Embed the complete Tauri Android runtime

This would promise the broadest Tauri API compatibility, but it gives both Tauri and React Native an interest in the Android application, activity, WebView, plugin, and lifecycle boundaries. A Fabric view is not a safe owner for a second application runtime. This option has the same ownership conflict rejected for iOS in ADR 0001.

### Generate one application-specific AAR

The CLI could generate a fat AAR containing Rust libraries, web assets, JNI, Kotlin, and React Native codegen integration. That makes the output look self-contained, but duplicates the reusable host bridge for every application and makes React Native codegen/version compatibility part of an application artifact. It also complicates Expo autolinking with a second Android library package.

### Export app-owned Rust libraries and assets

The CLI can export only the application-specific files. The reusable npm package can continue to own the React Native, Kotlin, JNI, and WebView implementation. Expo CNG can copy the generated files into the generated app, while a bare host can make the same copy explicitly.

## Decision

The React Native or Lynx host is the sole Android application and activity owner.

- `tauri-native export android` builds the Tauri frontend and uses `cargo-ndk` with API level 24 for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`.
- The Rust manifest must produce a `cdylib` in addition to the iOS `staticlib`. The CLI normalizes every ABI output to `jniLibs/<abi>/libtauri_native_core.so`, so the reusable bridge never depends on the Cargo package name.
- The frontend is copied unchanged to `assets/tauri-native`.
- The Expo config plugin copies the normalized libraries and assets into `android/app/src/main`. It replaces only `libtauri_native_core.so` and the dedicated `tauri-native` asset directory, preserving unrelated host files.
- The generated Java TurboModule calls a synchronous Kotlin implementation. Kotlin sends UTF-8 byte arrays through a small JNI library, which resolves the existing `tauri_native_invoke` and `tauri_native_string_free` C ABI from `libtauri_native_core.so`.
- Lynx Autolink discovers the Java native module and custom element from `@tauri-native/lynx`. Its JNI and WebView implementations consume the same normalized core and asset paths without adding Lynx-specific output to the CLI.
- The JNI library is linked with 16 KB ELF segment alignment for Android 15 and newer page-size compatibility.
- `TauriView` is backed by Android `WebView`. It serves only packaged assets from the synthetic `https://tauri-native.local` origin, rejects external navigation and subresources, and injects the narrow `window.__TAURI_INTERNALS__.invoke` seam before application scripts execute.

No generated AAR is introduced. The app-specific export remains owned by the Tauri project, while reusable Android bridges remain owned by `@tauri-native/react-native` and `@tauri-native/lynx`.

## Security and compatibility boundary

- `addJavascriptInterface` is exposed only to the packaged document. External navigation and subresources are blocked by the WebView client.
- Rust retains the command allowlist; the JavaScript interface cannot select native symbols.
- Rust requests and responses cross JNI as explicit UTF-8 bytes, avoiding JNI modified-UTF-8 corruption for non-ASCII JSON payloads.
- The WebView bridge remains an invoke compatibility seam. Tauri plugins, events, windows, capabilities, and full runtime behavior are unsupported.
- Direct TurboModule and Lynx native-module calls remain synchronous and are suitable only for short, CPU-bounded commands.

## Consequences

- Expo applications run `tauri-native export android` before Android prebuild, just as iOS applications export before pod installation.
- Lynx and bare React Native applications reference or copy `jniLibs` and `assets/tauri-native` into their Android app source sets themselves.
- `cargo-ndk`, the Android NDK, and the four Rust Android targets are build requirements for the Tauri project.
- The normalized library name is part of the host/export contract.
- Every host must initialize its own framework runtime; the bridge packages do not take ownership of `Application` or `Activity` lifecycle.

## Acceptance evidence

- CLI and config-plugin tests verify the Android command, four-ABI normalization, asset installation, and preservation of unrelated host libraries.
- React Native 0.86 codegen generated the TurboModule and Fabric component bindings from the published TypeScript specs.
- Expo SDK 57 Android prebuild and a four-ABI debug APK build completed successfully.
- On a 16 KB-page arm64 Android emulator, the React Native direct bridge evaluated `7 * (8 - 2)` to `42` through Rust.
- The packaged Tauri microfrontend loaded inside `TauriView` and independently evaluated the same expression to `42` through the WebView bridge and Rust.
- Lynx 4.0.1 Autolink registered the Android native module and `tauri-view` element. On the same emulator, both Lynx paths independently evaluated the expression to `42` through Rust.
- The Rust core and both host JNI libraries report `0x4000` ELF `LOAD` alignment, and the release APKs pass 16 KB `zipalign` verification.
