# Retained Tauri Mobile artifacts

The experimental retained export preserves the ordinary Tauri application and its platform bootstrap. The producer keeps its original commands, Builder/setup, state, frontend and native plugins. The generated integration lives in a disposable copy. Android export currently supports Tauri 2.11.5, CLI 2.11.4, tauri-runtime-wry 2.11.4 and Wry 0.55.1, with geolocation 2.3.3 and deep-link 2.4.10 as the verified external native plugins.

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

Omitting `--debug` selects a Release Rust build; omitting `--targets` selects all four Android targets. Completed native execution evidence currently covers **arm64 Debug on a 16 KB emulator**. Export-time ELF checks apply to every selected slice, but do not certify Release behavior or unexecuted architectures.

The result contains `android/`, a complete native Tauri project with its original Activity/Wry bootstrap, precompiled JNI library and copied relative Tauri/plugin Gradle dependencies. It also contains `manifest.json`, `callers.json`, the command model/bindings, the runtime header and package-owned `RuntimeSession.java`. The frontend and capabilities stay embedded by the ordinary Tauri build. Gradle no longer contains a Rust build task. Native libraries retain the original application library name; the original Tauri bootstrap loads it once.

Validate and retain an immutable artifact directory. Copy its Android project into a consumer workspace before making consumer-owned native changes or building, since Gradle creates files which are not part of the receipt:

```sh
cp -R ../artifacts/retained-android/android "./Native consumer"
cd "./Native consumer"
./gradlew assembleDebug
```

The consumer requires the Android SDK and JDK, plus access to Gradle's declared Maven dependencies. It requires neither producer Rust sources nor Cargo/Node for this native build. Use the exported Tauri Activity and lifecycle; replacing it with an unrelated host Activity is not an equivalent integration. RN/Expo and Lynx package-owned composition is still tracked by [#45](https://github.com/gronxb/tauri-native/issues/45) and [#46](https://github.com/gronxb/tauri-native/issues/46).

## Format and current limits

Format **2 / ABI 3** explicitly records retained bootstrap ownership, application identity, runtime/plugin versions, native slices, source/policy fingerprints and every artifact file checksum. Existing format **1 / ABI 0–2** artifacts retain their limited-adapter contract. Existing host package readers reject format 2; changing a receipt's version cannot migrate the native integration.

The Node-only reader and `doctor --artifacts` verify receipt integrity without Rust, and diagnose incompatible versions, missing/changed files, links, bootstrap mismatch and caller-policy receipt changes before integration. Export additionally validates ELF architecture, API 24, required C/JNI symbols, system dependencies and 16 KB load alignment. Publication preserves the previous output on failure. Mobile exports serialize by application identity because the upstream CLI shares its options file across platforms.

The captured Wry 0.55.1 Android client marks its existing `currentUrl` field volatile. Wry writes this field on the UI thread and reads it from the JavascriptInterface thread. This preserves its origin-selection logic while making the write visible across threads; original producer and Cargo registry files remain unchanged. The native gate checks the original frontend baseline, preserving ACL denial as a failure rather than bypassing it.

The retained incremental cache and watch mode are not implemented and return a diagnostic. iOS ABI 3 export, Release/other architecture execution, native configuration/cache invalidation, producer paths in debug metadata and a complete dependency/configuration receipt remain [#44](https://github.com/gronxb/tauri-native/issues/44) work. Native event/channel delivery and SDK lifecycle integration have their own M7–M8 acceptance. This experimental Android export does not establish six-way or physical-device release readiness.

## Native verification

`nub --cwd packages/cli run test:runtime:portable:android` exports the ordinary mobile-plugin fixture, verifies its source, deletes its disposable producer and relocates the artifact to a path with spaces. It runs receipt diagnosis and Gradle with Rust absent from PATH, checks APK 16 KB alignment, and installs the result on the selected `ANDROID_SERIAL` emulator.

The original frontend passes its ten runtime scenarios. A consumer-only native UI uses the package-owned JNI session to verify real Kotlin plugins: Tauri ACL denial, OS denial/grant, failed position without persistence, native position save, closure of a pending permission request, no late OS callback after retirement, remount, same-process deep-link delivery once and persistent notes after process relaunch. A `session_closed` response deliberately settles a pending native request during close; it is distinguished from the later OS callback. [Recorded evidence](evidence/retained-tauri-portable-android-2026-09-09.json).
