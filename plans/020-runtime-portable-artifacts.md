# [M7] Export portable Tauri runtime and plugin artifacts

## Outcome

Preserve artifact-only consumption while carrying the real Tauri mobile runtime and its native dependencies.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — format 2 / ABI 3 iOS and Android exports and real source-free native plugin acceptance pass on arm64 Debug and Release.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#42](https://github.com/gronxb/tauri-native/issues/42) (plan 018), [#43](https://github.com/gronxb/tauri-native/issues/43) (plan 019)
- Issue: [#44](https://github.com/gronxb/tauri-native/issues/44)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/020-runtime-portable-artifacts.md`

## Implementation

1. Version the artifact/runtime contract so limited-adapter artifacts cannot be mistaken for retained-runtime artifacts.
2. Export Rust libraries, native runtime/plugin code or binaries, resources, framework/Gradle dependencies, configuration, capabilities and generated host contracts.
3. Generate source-free Pod/Gradle integration with explicit app bootstrap requirements and deterministic conflict diagnostics.
4. Validate integrity, architecture, ABI, dependency resolution and relocation; keep atomic publication and incremental invalidation.

## Meaningful verification

- Copy to a path with spaces, delete the producer and build without Rust in PATH.
- Change a capability or native plugin dependency and verify cache invalidation.
- Incompatible runtime version, missing resource and lifecycle configuration conflict fail before loading.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] Both platform exports contain everything needed by independent consumers.
- [ ] Old and new artifact modes are explicitly distinguished and migration is documented.
- [ ] No producer absolute paths or implicit source rebuilds remain.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## M6 handoff

The composition probes modify only generated platform scaffolds while the authored producer hashes match. Carry the complete Tauri platform bootstrap plus renderer/native dependency initialization into portable artifacts; do not distribute the proof's absolute npm/project paths or require a host Rust rebuild. Native integration must declare deployment requirements (the RN 0.86.3 iOS probe uses 16.4, while standalone Tauri remains 14.0).

Android inspection found the standard NDK 27 Tauri Rust library was initially 4 KB aligned. Generated composition now links it for 16 KB and validates every packaged ELF. Retain both ELF and APK alignment checks in production. Tauri 2.11.5 also failed to regenerate Activity classes when only the Android output directory changed while sharing Cargo caches; define deterministic output-directory invalidation rather than relying on the probe's targeted `cargo clean -p tauri`.

Concurrent standard mobile builds with the same app identity also overwrote Tauri CLI 2.11.4 connection options during M6. Its [options implementation](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-cli/src/mobile/mod.rs#L334) keys the temporary server-address file by the original app identifier. The proof runs serialize across platforms; production export must isolate or serialize those options as well.

M7 reruns also found that Tauri CLI 2.11.4 can successfully archive an iOS app and then fail to rename it into an existing nonempty `build/arm64-sim/*.app`. Build in disposable output directories and publish only fully validated artifacts; never treat a failed post-build move as a completed export. Mobile UI gates additionally share Maestro's local driver port and now acquire a common test lock for their full execution.


## Implementation progress — 2026-09-09

`export android --runtime retained --caller-policy <file>` now captures the actual Tauri bootstrap, JNI library, native Tauri/geolocation/deep-link Gradle projects and generated contracts in a distinct format 2 / ABI 3 receipt. Publication remains staged and atomic; unsupported plugin versions, custom build declarations, lifecycle owners, missing files, changed checksums and incompatible contracts fail explicitly. `doctor --artifacts` validates a copied receipt without Rust. Format 1 consumers reject format 2, preserving the limited-adapter boundary. [Usage and current limits](https://github.com/gronxb/tauri-native/blob/main/docs/retained-artifacts.md).

The Android arm64 Debug gate exports, deletes its disposable producer, relocates to a path with spaces and builds with only system tools on PATH. The installed APK passes both the unchanged frontend baseline and package-owned JNI calls into actual Kotlin plugins: separate ACL/OS denial, location permission grant, no saved note after denied position, native location persistence, a pending request settled as `session_closed`, no late OS delivery to the retired session, remount, same-process deep-link delivery once and process-relaunch persistence. ELF and APK 16 KB checks pass. [Evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-android-2026-09-09.json).

Source-free cold-start testing exposed a Wry 0.55.1 cross-thread URL visibility issue. The captured generated Android client marks its existing `currentUrl` field volatile; original URL selection and ACL checks remain intact. Three diagnostic cold starts and the full native feature run pass with this correction. The producer source and installed Cargo registry remain unchanged.

iOS `export ios --runtime retained` now packages the actual `libapp.a` with Swift geolocation in an XCFramework, the original native Tauri project/Info.plist/entitlements and the package-owned Objective-C++ session client. The captured project removes the Rust build phase and producer navigation group, preserves its UIApplication bootstrap and links only relative runtime files. Source-free Xcode build, original frontend baseline and the same native permissions/retirement/location/deep-link/persistence scenarios pass after source deletion and relocation. [iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-ios-2026-09-09.json). Export validates selected slice metadata, architecture, C ABI/startup symbols and the Swift geolocation entry point. Deep-link on iOS uses the original Tauri `RunEvent::Opened`; it has no separate Swift plugin entry point.

Retained `--incremental` now keys validated artifacts on authored files (including native declarations under `gen/`), installed Cargo dependency source bytes, configuration/environment, toolchain, generator, target/profile and caller policy. `build.json` records these fingerprints without absolute producer filenames. Copy verification runs before generated source changes, and producer/dependency checks run before publication. Known plugin Gradle/Swift output directories are excluded from source hashes; unknown source changes continue to invalidate. A source-free reader rejects relabelling a recorded Debug artifact as Release.

Remaining: other architecture execution, authored native-project/compiler configuration preservation and package-owned RN/Expo/Lynx integration. These scoped native results do not close #44 or certify a six-way release.

The cache-enabled Android and iOS arm64 Debug exports both pass unchanged incremental hits followed by the full source-free native plugin/UI gate. iOS additionally changes an ordinary capability to an unknown permission and requires the real Tauri build to reject it; the previous complete receipt is preserved and subsequently passes native execution. The restored disposable producer hashes match before deletion. Evidence: [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-cache-ios-2026-09-09.json), [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-cache-android-2026-09-09.json). CLI tests (61), package packing and typechecks pass. The Android iteration predates the added native invalid-capability scenario; the evidence states that limit explicitly.


Arm64 Release native plugin acceptance now passes on both platforms after producer deletion and relocation: [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-release-ios-2026-09-09.json), [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-release-android-2026-09-09.json). Both verify real invalid-capability failure preserves the last valid artifact; Android retains R8 and uses test-only signing/debuggability for telemetry. Rust prefix remapping and native debug stripping remove the producer/generated/target/Cargo-home paths checked in every library without dropping required native symbols. A compiler scenario with spaces verifies explicit environment flags and `file!()` remapping. These results establish the pinned fixture, not arbitrary custom Cargo/native build configurations.


All seven Release slices and their independent consumer links now pass: [evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-release-slices-2026-09-09.json). The gate deletes the producer, relocates both complete exports to paths with spaces, links iOS device arm64 plus simulator arm64/x86_64 apps without Rust, and builds an unsigned Android universal Release/R8 APK with all four ABIs and 16 KB alignment. The pinned CLI's simulator host-architecture substitution is handled only in the generated iOS build script/settings and validated against actual native libraries. Two preceding architecture attempts failed explicitly and are recorded separately. CLI tests (62), package contents and typechecks pass. Authored native/compiler configuration, SDK composition and physical-device execution remain open.


Existing native-project configuration now passes dedicated arm64 Release execution on both platforms: [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-native-config-ios-2026-09-09.json), [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-native-config-android-2026-09-09.json). The pre-fix iOS export preserved source bytes but reset the authored deployment target from 15.0 to 14.0 by rerunning init; the corrected exporter preserves the existing Xcode/Gradle projects. Final apps retain the authored iOS deployment target/Info.plist key and Android Manifest metadata/asset, with the complete native plugin/lifecycle scenarios still passing.

Path remapping now runs through a generated compiler wrapper after Cargo resolves original configuration/environment flags. Native build callbacks receive the wrapper via CARGO_* aliases supported by the pinned Tauri CLI. Compiler output is isolated per export and cleaned on success/failure; artifact-level incremental hits and invalid-capability preservation still pass. A custom compiler-output directory is excluded from producer inputs, including macOS path aliases. Compiler scenarios verify configured flags, encoded/plain environment flags and an existing wrapper; config-only compiler wrappers receive an explicit diagnostic instead of being dropped. CLI tests (65), typechecks and package contents pass. These scoped results leave package-owned RN/Expo/Lynx, native event/channel and broader compatibility/release acceptance to their remaining M7–M8 gates.
