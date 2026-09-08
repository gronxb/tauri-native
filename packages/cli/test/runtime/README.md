# Real Tauri runtime verification

The ordinary producer lives in `../fixtures/runtime-tauri`. Standalone checks are documented there. Composition checks copy that producer, preserve its authored files and modify only generated platform integration. They execute real native renderers and Tauri/Wry. These are M6 feasibility gates, not the public exporter or portable host SDK.

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
