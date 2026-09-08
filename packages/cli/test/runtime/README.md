# Real Tauri runtime verification

The ordinary producer lives in `../fixtures/runtime-tauri`. Standalone checks are documented there. Composition checks copy that producer, preserve its authored files and modify only generated platform integration. They execute real native renderers and Tauri/Wry. These are M6 feasibility gates, not the public exporter or portable host SDK. Run all runtime/composition gates one at a time, including across iOS and Android: Tauri CLI 2.11.4 shares mobile build connection options for this application identifier, so concurrent builds can overwrite a still-running build's options.

## Android Lynx

Install workspace dependencies first (`nub ci`). On macOS with an arm64 emulator booted:

```sh
export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export ANDROID_SERIAL=emulator-5554
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$HOME/.maestro/bin:$PATH"
nub --cwd packages/cli run test:runtime:compose:android
```

The test requires Node, npm, Cargo, the standard Tauri Android toolchain, `unzip` and Maestro. It uses installed `examples/lynx` JS dependencies and downloads the pinned Lynx Android libraries through Gradle. It recreates its ignored producer/renderer workspaces under `target/tauri-mobile-composition/lynx-android/`, installs `dev.taurinative.runtimeproof`, checks native UI and reports, and uninstalls that proof app afterward. Do not run another proof using that application ID on the same emulator concurrently.

The Activity retains Tauri's superclass and lifecycle. The Lynx surface mounts after the unchanged Tauri frontend completes its ten baseline assertions. Actual Lynx JS calls a test native module, which evaluates a probe through the retained Tauri WebView's IPC. Assertions require shared state 45, single setup/plugin initialization, allow/deny enforcement without denied side effects, the same process after background/resume, and a second native surface after destruction of the first. Maestro must find and tap the actual renderer controls. Reports alone cannot pass the gate.

The generated build adds 16 KB Rust linker alignment and inspects all native ELF load segments packaged in the APK. Tauri 2.11.5's build cache does not track a changed Android codegen output directory, so the test refreshes only the `tauri` crate's Android output before building its disposable platform project. Authored producer hashes are checked even when the test fails.

This probe uses the original WebView caller's permissions. Production direct native caller identity and dispatch belong to #42. Native Swift/Kotlin plugin integration, artifacts, Expo, Release and physical devices have separate M7–M8 acceptance.

## iOS Lynx

With workspace dependencies installed, boot an arm64 iOS simulator and run:

```sh
export PATH="$HOME/.cargo/bin:$HOME/.maestro/bin:$PATH"
export IOS_SIMULATOR_UDID=<booted-simulator-UDID>
nub --cwd packages/cli run test:runtime:compose:ios
```

Xcode, xcodegen, CocoaPods, the standard Tauri iOS tools and Maestro are required. The test creates a disposable standard Tauri project under `target/tauri-mobile-composition/lynx-ios/`, adds only generated native sources/resources/Pod dependencies and retains the sole `ffi::start_app()` bootstrap. It registers UIKit lifecycle observers before Tauri starts and attaches a real Lynx view to the original WKWebView's parent after the baseline completes. The original Tauri app delegate and WebView stay alive; no replacement UIApplication or RN/Lynx app delegate is introduced.

The same five native JS probes, real UI actions, remount and background/resume assertions apply. The harness installs and removes only `dev.taurinative.runtimeproof` on the selected simulator. Evidence is Debug Simulator execution; it does not establish Swift plugin/OS callback coverage or production direct native dispatch.

## React Native

With the same per-platform environment as above, run `test:runtime:compose:rn:ios` or `test:runtime:compose:rn:android` from the CLI package. These select React Native 0.86.3 instead of Lynx. They use installed `examples/react-native` JS dependencies to build an offline Metro bundle, but do not install Expo native modules. Results/logs live under `target/tauri-mobile-composition/react-native-{ios,android}/`.

Android retains `TauriActivity`, initializes RN's `ReactHost`, attaches real Fabric surfaces and awaits actual asynchronous surface stop before remount. Generated integration registers the real RN core Java TurboModule provider through the standard app library entry, uses the matching Hermes 250829098.0.17 and NDK/C++ runtime, and adds the RN-required Kotlin 2.1.20 compiler. CMake 3.22.1 is required. The APK remains Debug and debuggable; native debug symbols are stripped to keep emulator installation small. All packaged native ELF segments must still satisfy 16 KB alignment.

iOS retains `ffi::start_app()` and Tauri's UIApplication delegate, then uses `RCTReactNativeFactory` to create and stop Fabric root views. RN raises only the generated native target's deployment minimum to 16.4; the authored Tauri configuration stays unchanged. The same five actual renderer calls, UI interactions, lifecycle/remount, shared state, plugin allow/deny and source-integrity assertions apply to both platforms.
