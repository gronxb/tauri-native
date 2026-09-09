# Retained Tauri Mobile artifacts

The experimental retained export preserves the ordinary Tauri application and its platform bootstrap. The producer keeps its original commands, Builder/setup, state, frontend and native plugins. The generated integration lives in a disposable copy. iOS and Android exports currently support Tauri 2.11.5, CLI 2.11.4, tauri-runtime-wry 2.11.4 and Wry 0.55.1, with geolocation 2.3.3 and deep-link 2.4.10 as the verified external native plugins.

## Export and consume

Install the ordinary producer's dependencies and mobile toolchain first. Define a separate caller policy; for example:

```json
{
  "version": 1,
  "callers": {
    "native": {
      "webview": "main",
      "commands": ["snapshot", "plugin:geolocation|check_permissions"]
    }
  }
}
```

These exact grants delegate access through the original local `main` WebView. Its actual Tauri capabilities and plugin scopes still apply, followed by the platform's OS permissions. Native app code is trusted; a caller name is not an authentication boundary for arbitrary native code. Wildcards and duplicate grants are rejected.

```sh
tauri-native export android --runtime retained \
  --tauri-dir src-tauri --caller-policy ../native-callers.json \
  --targets aarch64 --debug --output-dir ../artifacts/retained-android

tauri-native doctor --artifacts ../artifacts/retained-android --platform android
```

Omitting `--debug` selects a Release Rust build; omitting `--targets` selects all four Android targets. Completed native execution evidence currently covers **arm64 Debug on an iOS Simulator and a 16 KB Android emulator**. Export-time ELF checks apply to every selected slice, but do not certify Release behavior or unexecuted architectures.

The result contains `android/`, a complete native Tauri project with its original Activity/Wry bootstrap, precompiled JNI library and copied relative Tauri/plugin Gradle dependencies. It also contains `manifest.json`, `callers.json`, the command model/bindings, the runtime header and package-owned `RuntimeSession.java`. The frontend and capabilities stay embedded by the ordinary Tauri build. Gradle no longer contains a Rust build task. Native libraries retain the original application library name; the original Tauri bootstrap loads it once.

Validate and retain an immutable artifact directory. Copy its Android project into a consumer workspace before making consumer-owned native changes or building, since Gradle creates files which are not part of the receipt:

```sh
cp -R ../artifacts/retained-android/android "./Native consumer"
cd "./Native consumer"
./gradlew assembleDebug
```

The consumer requires the Android SDK and JDK, plus access to Gradle's declared Maven dependencies. It requires neither producer Rust sources nor Cargo/Node for this native build. Use the exported Tauri Activity and lifecycle; replacing it with an unrelated host Activity is not an equivalent integration. RN/Expo and Lynx package-owned composition is still tracked by [#45](https://github.com/gronxb/tauri-native/issues/45) and [#46](https://github.com/gronxb/tauri-native/issues/46).

### iOS

```sh
tauri-native export ios --runtime retained \
  --tauri-dir src-tauri --caller-policy ../native-callers.json \
  --targets aarch64-sim --debug --output-dir ../artifacts/retained-ios

tauri-native doctor --artifacts ../artifacts/retained-ios --platform ios
```

Omitting `--targets` selects device arm64 plus simulator arm64/x86_64; omitting `--debug` selects Release. The completed execution currently covers simulator arm64 Debug. The output contains the original Tauri Xcode project, Info.plist/entitlements/resources, `TauriNativeRuntime.xcframework` and `TNRuntimeSession.h/.mm`. The XCFramework carries actual Tauri startup and the native Swift geolocation implementation. Deep-link uses the original Tauri iOS lifecycle. The exported Xcode target has no Rust build phase or producer source dependency.

Copy `ios/` into the consumer workspace and build its original project/scheme with Xcode. Project and target names are recorded in `manifest.json`; retain their original startup and native declarations. Simulator acceptance builds with `CODE_SIGNING_ALLOWED=NO`; device distribution requires ordinary app signing. This native build needs Xcode, without producer sources, Cargo or Node. Package-owned RN/Expo/Lynx integration remains tracked separately.

## Format and current limits

Format **2 / ABI 3** explicitly records retained bootstrap ownership, application identity, runtime/plugin versions, native slices, source/policy fingerprints and every artifact file checksum. Existing format **1 / ABI 0–2** artifacts retain their limited-adapter contract. Existing host package readers reject format 2; changing a receipt's version cannot migrate the native integration.

The Node-only reader and `doctor --artifacts` verify receipt integrity without Rust, and diagnose incompatible versions, missing/changed files, links, bootstrap mismatch and caller-policy receipt changes before integration. Export additionally validates ELF architecture, API 24, required C/JNI symbols, system dependencies and 16 KB load alignment. iOS additionally checks XCFramework platforms/architectures, exported C ABI and original startup symbols, plus the Swift geolocation entry point when selected. Publication preserves the previous output on failure. Mobile exports serialize by application identity because the upstream CLI shares its options file across platforms.

The captured Wry 0.55.1 Android client marks its existing `currentUrl` field volatile. Wry writes this field on the UI thread and reads it from the JavascriptInterface thread. This preserves its origin-selection logic while making the write visible across threads; original producer and Cargo registry files remain unchanged. The native gate checks the original frontend baseline, preserving ACL denial as a failure rather than bypassing it.

`--incremental` reuses only a complete, unchanged receipt; `--force` rebuilds it. `build.json` records authored input hashes, actual resolved Cargo dependency source hashes (including installed local changes), Cargo configuration/environment fingerprints, toolchain fingerprints, selected targets/profile and generator/runtime fingerprints. Native Manifest, Info.plist, entitlements, native source and build declarations under `gen/` remain inputs. Only known generated build/cache directories are excluded. Inputs are checked before generation and again before atomic publication. Changing capabilities invalidates the cache; a failed native build preserves the previous output. Watch remains unsupported and returns a diagnostic. Arm64 Release native execution and source-path checks now pass on both platforms; other architecture execution and authored native-project customization remain [#44](https://github.com/gronxb/tauri-native/issues/44) work. Native event/channel delivery and SDK lifecycle integration have their own M7–M8 acceptance. These experimental exports do not establish six-way or physical-device release readiness.

## Native verification

`nub --cwd packages/cli run test:runtime:portable:android` exports the ordinary mobile-plugin fixture, verifies its source, deletes its disposable producer and relocates the artifact to a path with spaces. It verifies a matching incremental hit and rejects a changed invalid capability without replacing the last valid export. It then runs receipt diagnosis and Gradle with Rust absent from PATH, checks APK 16 KB alignment, and installs the result on the selected `ANDROID_SERIAL` emulator.

The original frontend passes its ten runtime scenarios. A consumer-only native UI uses the package-owned JNI session to verify real Kotlin plugins: Tauri ACL denial, OS denial/grant, failed position without persistence, native position save, closure of a pending permission request, no late OS callback after retirement, remount, same-process deep-link delivery once and persistent notes after process relaunch. A `session_closed` response deliberately settles a pending native request during close; it is distinguished from the later OS callback. [Recorded evidence](evidence/retained-tauri-portable-android-2026-09-09.json).

The matching `test:runtime:portable:ios` gate runs against the selected `IOS_SIMULATOR_UDID`, validates native usage/scheme declarations and compiles the relocated Xcode project with only system tools on PATH. It passes the same native scenarios through actual Swift geolocation callbacks and original Tauri UIApplication/deep-link routing. Maestro activation preserves the existing process (`stopApp: false`) and uses an empty permission map to avoid automatic grants; the test checks PID liveness and still requires real OS denial and grant UI. [iOS evidence](evidence/retained-tauri-portable-ios-2026-09-09.json).

Cache-enabled native evidence: [iOS](evidence/retained-tauri-cache-ios-2026-09-09.json), [Android](evidence/retained-tauri-cache-android-2026-09-09.json). Both repeat the complete native feature gate after an unchanged cache hit. The iOS iteration also exercises changed invalid capabilities and preservation of the last valid artifact on actual native build failure.


The same native acceptance runs in Release with `node --experimental-strip-types packages/cli/test/runtime/portable.ts ios --release` (or `android --release`). Both actual plugin/lifecycle runs pass: [iOS](evidence/retained-tauri-release-ios-2026-09-09.json), [Android](evidence/retained-tauri-release-android-2026-09-09.json). Android keeps R8 optimization, with a consumer-only debug signing key and debuggability for test telemetry; this is not distribution-signing evidence. Both exports reject a changed invalid capability, preserve the previous artifact and accept an unchanged cache hit. iOS telemetry writes execute outside `NSAssert`, which Release compiles out.

Native libraries remap Rust producer, generated integration, target and Cargo-home paths and strip native debug records before publication. Explicit environment compiler flags survive, including encoded flags and paths with spaces. Each native library is scanned for those original paths and still must pass the architecture/startup/plugin/ABI checks. Custom Cargo configuration compiler flags require separate compatibility verification; environment preservation alone does not establish that support.


For the pinned CLI, iOS target selection updates only the generated copy's explicit Xcode architecture settings. [Tauri CLI 2.11.4's simulator shortcut](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/src/mobile/ios/xcode_script.rs#L201) replaces requested simulator architectures with the CLI host architecture. The generated x86_64 build disables that display-name shortcut while retaining the real simulator SDKROOT and upstream x86_64 simulator target selection. Actual library architecture and platform checks remain mandatory. The project stays in OpenStep format during Tauri's version update, then the captured consumer project exposes every selected XCFramework slice.


`nub --cwd packages/cli run test:runtime:slices` now passes all seven Release slices (iOS device arm64, simulator arm64/x86_64; Android arm64-v8a/armeabi-v7a/x86/x86_64). After source deletion and relocation, each iOS architecture links an actual app with no Rust on PATH, and Android builds a universal unsigned Release/R8 APK containing all four validated libraries and passing 16 KB ZIP alignment. [Evidence](evidence/retained-tauri-release-slices-2026-09-09.json). This is architecture/link evidence; runtime plugin execution remains the separately recorded arm64 simulator/emulator gate, and physical devices are still required for release readiness.
