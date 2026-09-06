# Portable native artifacts

The producer installs `@tauri-native/cli` and exports its ordinary Tauri project. Copy the **whole platform directory** to the mobile host. The host builds with its native tools and bridge package; it does not need the producer checkout, Cargo, Rust source, or the CLI.

## iOS

```sh
# In the ordinary Tauri project, with Xcode and Rust installed:
npx tauri-native export ios
cp -R src-tauri/gen/tauri-native/ios ../mobile-app/ios/tauri-native
```

| Path | Purpose |
| --- | --- |
| `TauriNativeCore.xcframework` | Static library and generated C header for arm64 iOS devices and arm64/x86_64 simulators. |
| `TauriNativeAssets.bundle` | The configured frontend output, plus bundle `Info.plist`. Resources are a sibling of the XCFramework. |
| `TauriNativeGenerated.podspec` | Local CocoaPods integration. |
| `commands.json` | Registered command names, argument keys/Rust types and source locations; no source path. This is metadata, not yet a generated TypeScript SDK. |
| `manifest.json` | Format/ABI/CLI versions, verified API contract, native slices, source fingerprints and relative file checksums. |

For CocoaPods, add this inside the host target in `ios/Podfile`, then run `pod install` in the host:

```ruby
pod 'TauriNativeGenerated', :path => './tauri-native'
```

For manual Xcode integration, add the XCFramework to the host's linked libraries without embedding the static library. Add `TauriNativeAssets.bundle` to Copy Bundle Resources. Import the selected slice's `Headers/tauri_native.h` through the host's bridging header or C/Objective-C includes. The minimum iOS deployment target is 13.0. Keep the whole export directory together so metadata and binary versions move together.

A custom native consumer checks `tauri_native_abi_version() == 1`, calls `tauri_native_invoke(command, payloadJson)`, copies the returned UTF-8 JSON, and calls `tauri_native_string_free` exactly once for every non-null result. ABI 1 frames contain `{abiVersion:1,ok:true,value}` or `{abiVersion:1,ok:false,error}`. Serialize arguments as JSON. The host owns lifecycle and does not start another Tauri runtime.

React Native/Expo consumers use a host-owned `artifactsDir` or bare RN local Pod/source sets; see the [RN guide](../packages/react-native/README.md). [Lynx consumers](../packages/lynx/README.md) use the same copied artifacts and Node validation through their host package, with public Lynx native modules/autolinking. The native relocation gate below verifies a minimal independent UIKit/WKWebView consumer; the [RN/Expo gate](../packages/react-native/test/native-artifacts/README.md) and [Lynx gate](../packages/lynx/test/native-artifacts/README.md) separately exercise the installed host packages. These simulator gates do not certify physical-device execution.

## Android

```sh
cargo install cargo-ndk --locked
npx tauri-native export android
cp -R src-tauri/gen/tauri-native/android ../mobile-app/android/tauri-native
```

Android exports `jniLibs/<abi>/libtauri_native_core.so` for `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64`; `assets/tauri-native` contains the unchanged frontend. Generated ABI 1 exports also include `include/tauri_native.h` and `commands.json`. The shared `manifest.json` records API floor 24, page alignment 16384, every ABI/library path and all file checksums. Android has no generated podspec or host-specific AAR.

The host adds the copied `jniLibs` and `assets` directories to its Android source sets and builds its own JNI/SDK bridge. For a copied directory at `android/tauri-native`, a conventional `android/app/build.gradle` setup is:

```groovy
android {
  sourceSets {
    main {
      jniLibs.srcDirs += ['../tauri-native/jniLibs']
      assets.srcDirs += ['../tauri-native/assets']
    }
  }
}
```

Export uses `cargo-ndk`'s configured NDK and sets the final library's 16 KB link alignment and stable SONAME. It runs the NDK's `llvm-readelf` to verify the machine/class, load-segment alignment, API 24 identification, exported ABI functions, SONAME and system dependencies available at API 24. An additional shared dependency that is not a platform library is rejected rather than leaving a missing library for the host to discover. Producer code must still avoid assumptions about a fixed runtime page size; see the [Android NDK build-system guide](https://android.googlesource.com/platform/ndk/+/ndk-r27-release/docs/BuildSystemMaintainers.md#Page-sizes).

The final host APK needs both compatible native libraries and correct ZIP alignment. The relocation gate verifies the actual signed APK using `zipalign -c -P 16 -v 4` and runs it on an emulator whose `getconf PAGE_SIZE` returns `16384`. See [Android's zipalign documentation](https://developer.android.com/tools/zipalign). Host bridge execution has separate RN/Expo and Lynx gates.

## Manifest contract

Use [artifact-only doctor](diagnostics.md) or the host SDK's `readArtifacts` to validate a copied directory without the producer or Rust. The CLI and both SDKs share receipt checks and diagnostic codes; the Expo plugin validates before copying. Source comparison requires an explicit producer path and only reports the recorded evidence.

Format 1 uses relative POSIX file paths. `files` contains each exported file's SHA-256 and byte count, excluding `manifest.json` itself. Validation checks the full inventory: missing, changed, duplicate or extra files and symlinks are errors. The manifest is an integrity record, not a signature or proof that a third party's artifact is trustworthy.

`native` describes library paths, architectures and device/simulator variants. iOS export checks XCFramework metadata, actual archive architectures, ABI symbols in every architecture and the generated ABI header before publishing. It inspects machine-code symbols instead of asking Xcode's possibly older LLVM reader to parse embedded Rust bitcode.

`compatibility` identifies the generated ABI contract verified against Tauri 2.11.5 and `@tauri-apps/api` 2.11.1. This is a tested compatibility pair, not a claim that the producer installed that exact JavaScript package. Unsupported behavior is described in the [compatibility contract](compatibility.md).

`source` records SHA-256 fingerprints for the original Rust entry, selected Cargo manifest, existing workspace lockfile and Tauri JSON configuration. `frontendSha256` hashes the sorted frontend file inventory before bundle metadata is added. These named fingerprints are provenance for those inputs; they are **not a complete dependency graph or incremental cache key**. No original absolute paths, environment variables or source contents are stored in the manifest.

Explicit legacy `--manifest`/`--header` export emits ABI 0 metadata, no verified Tauri/API compatibility and no `commands.json`. Its input fingerprints cover the selected legacy manifest/configuration and, on iOS, the header. A manually owned ABI 0 artifact is not a generated ABI 1 artifact.

## Publication and failure behavior

`--output-dir` must name a dedicated generated directory, for example `mobile-app/ios/tauri-native`. A folder containing unrelated top-level host files is rejected before building. Do not select the host's entire `ios` directory.

The CLI builds in an adjacent temporary directory and validates all output before publication. A first export uses a directory rename; on macOS, replacing an existing export uses the filesystem's atomic directory exchange. A failed build, validation error or interruption before publication leaves the prior export intact. Unsupported filesystems fail without falling back to a destructive replacement. Force-killing a process can leave an adjacent `.NAME-stage-*` directory; it is disposable and is never a published export.

The current portable-export producer gates certify macOS. Atomic replacement is implemented and tested on macOS; Linux/Windows replacement is not yet supported. Target binaries remain ordinary iOS/Android artifacts and the host never calls the publication helper.

Frontend bytes are preserved. `frontendDist/Info.plist` is reserved for the iOS bundle metadata and is rejected instead of silently overwritten. Re-run export to change generated content; editing individual files invalidates the manifest.

For repeated development exports, opt into [incremental export or watch](development-loop.md). A result-cache hit validates the whole artifact; a rebuild still uses staged publication. Concurrent writers to one output receive `output_busy`. Ctrl-C in watch waits for its current export, while forced termination can leave an output lock that must be removed after confirming its process has stopped.

## Verification

On a configured Mac, install the workspace's example frontend dependencies and run:

```sh
nub --cwd packages/cli run test
nub --cwd packages/cli run test:export:contract
nub --cwd packages/cli run test:export:ios
```

The iOS gate packs and installs the CLI, exports the ordinary source fixture, compares authored source and frontend bytes, and copies the result into a path with spaces. It then deletes its producer and CLI installation. The independent host build has no Rust tools on PATH and uses only copied native artifacts/resources and its own Swift code. An available iOS Simulator executes direct native calls and the unchanged frontend's ordinary `@tauri-apps/api/core` calls. The gate removes its uniquely identified test app, deletes a simulator only if it created one, and writes evidence to `target/export-ios/report.json`. The device slice is compiled and inspected; this gate does not run on a physical iPhone.

Package tests exercise corrupted/missing output, incompatible ABI, actual SIGTERM interruption, successful replacement, unrelated host files and invalid manifest paths. A skipped native gate is not release evidence.

For the Android gate, configure `ANDROID_HOME` (SDK), `JAVA_HOME` (JDK 17+) and one running 16 KB Android emulator, then run `nub --cwd packages/cli run test:export:android`. The SDK needs platform/build tools including `aapt2`, `d8`, `apksigner`, `zipalign` and `adb`; the producer also needs `cargo-ndk` and the NDK. The gate installs the packed CLI, exports/copies artifacts, deletes producer/CLI inputs, and builds a separate Java/JNI/WebView host with Rust absent from its PATH. JNI is host-owned test code and is never part of the producer artifacts. All four ABIs are compiled/inspected; runtime evidence covers only the named emulator ABI. The gate removes its uniquely identified test app and writes `target/export-android/report.json`.

Verified Android environment: macOS, cargo-ndk 4.1.2, NDK r27b, Android build tools 37.0.0, the Android Studio bundled JDK, and an API 37 arm64 emulator with 16 KB pages. API 24 is the linked library/host minimum; this gate does not claim execution on every supported Android version or CPU.
