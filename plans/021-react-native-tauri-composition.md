# [M8] Compose React Native and Expo with retained Tauri Mobile

## Outcome

RN and Expo add native UI and command access while preserving the ordinary Tauri Mobile application.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — packed RN Android Release/R8 execution passes with retained artifacts; iOS, Expo and automatic composition remain open.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#41](https://github.com/gronxb/tauri-native/issues/41) (plan 017), [#44](https://github.com/gronxb/tauri-native/issues/44) (plan 020)
- Issue: [#45](https://github.com/gronxb/tauri-native/issues/45)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/021-react-native-tauri-composition.md`

## Implementation

1. Implement package-owned RN surface attachment and lifecycle cooperation with the M6-selected startup owner.
2. Connect TurboModule calls and TauriView to the retained Tauri app; define readiness, navigation, back handling and renderer/runtime teardown.
3. Generate Expo CNG and bare-RN native integration from copied artifacts, diagnosing delegate/Activity/plugin conflicts.
4. Demonstrate ordinary Tauri state, setup, events and a native plugin from RN UI and the unchanged frontend.

## Meaningful verification

- Direct native and embedded calls see one state before/after RN reload and view remount.
- Background/resume, permission result and deep link each reach their intended recipient once.
- Expo clean prebuild recreates integration without producer source or Rust.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] iOS and Android RN Release executions pass with copied runtime artifacts.
- [ ] Ordinary standalone Tauri Mobile remains independently runnable.
- [ ] Existing limited-adapter users have an explicit migration path.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## M6 handoff

The iOS prototype uses `RCTReactNativeFactory` and a real Fabric root view under the retained Tauri view hierarchy; it does not install an RN UIApplication delegate. The Android candidate keeps `TauriActivity` and uses `ReactHost`/`ReactSurface`, forwarding RN resume/pause and awaiting asynchronous surface stop before remount. Carry RN's core TurboModule provider registration and matching Hermes/C++ dependencies into generated native integration.

The probes use RN 0.86.3 and an offline JS bundle with a test-only callback module. They do not establish Expo native module/autolinking or lifecycle coverage, production TurboModule contracts, Activity recreation, deep links, permission results or Release artifacts. Verify those scenarios in this issue rather than treating M6 surface coexistence as package support.

## Android SDK execution (2026-09-09)

The package now provides `@tauri-native/react-native/retained`, a generated
`TauriNativeRuntime` TurboModule and `TauriReactHost` owning a Fabric surface and
independent RN engine. RN and Lynx ship the same session client without depending
on each other. The original Tauri Activity, WebView, native plugins and bootstrap
remain in place; no producer bridge is added. The host retires native sessions
before RN engine destruction, forwards lifecycle/intents and owns AndroidX back
dispatch with fallback to the original dispatcher.

`packages/react-native/test/retained-android.ts` packs the actual SDK, bundles its
compiled public entry and builds a relocated format 2 arm64 consumer without Rust
on PATH. RN/codegen 0.86.3 and Hermes 250829098.0.17 execute in a non-debuggable
Release/R8 APK. All eleven ELF libraries and APK 16 KB alignment pass. Eight
JUnit flows cover shared state/setup, separate Tauri/native/OS permission
decisions, actual Kotlin geolocation/save/events, RN BackHandler and Linking,
background deep links, RN engine replacement and removal. Native listeners go
from one to zero to one at replacement, then zero at removal. The original
frontend still handles commands in the same process after RN is destroyed.
[Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json).

The SDK includes only its own `appmodules` native library; pinned upstream AARs
supply RN/Hermes dependencies. RN/codegen version mismatches fail before codegen.
The original AGP 8.11 K2 lint crashes on applied Kotlin Gradle scripts
([upstream issue](https://issuetracker.google.com/issues/430991549)); the consumer
selects its K1 analyzer while retaining Release lint checks. Earlier failed
builds and this toolchain constraint are recorded separately in the evidence.

Consumer fixtures still supply attachment/layout and Activity forwarding hooks.
This is not Expo CNG or automatic integration. RN iOS, retained TauriView,
Activity recreation, RN-owned permissions, renderer destruction during a pending
OS permission callback, migration and full parity/device/adopter gates remain
required. The input artifact is unchanged; this consumption run does not re-export
Rust or re-prove the later Android origin-capture fix. No acceptance item is
closed by the Android-only result.
