# [M6] Prove real Tauri Mobile startup and native renderer coexistence

## Outcome

Keep a normal Tauri Mobile app running with its actual state, setup, IPC and plugin machinery, then establish one native lifecycle owner while attaching RN and Lynx.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: DONE — real standalone baseline, all four native composition combinations, serialized harness rechecks and standalone execution after integration removal passed on 2026-09-09. ADR 0007 records a scoped architecture GO.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: existing M0–M5 evidence; this is the new feasibility gate
- Issue: [#41](https://github.com/gronxb/tauri-native/issues/41)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/017-tauri-mobile-runtime-proof.md`

## Implementation

1. Add an ordinary Tauri fixture with managed state, AppHandle, setup, async commands, plugin initialization, Rust events and allow/deny capabilities. No host imports or synthetic Tauri runtime.
2. Add an executable real-Wry baseline with source hashing and assertion-bearing evidence; build/run standalone iOS and Android copies through the standard Tauri toolchain.
3. Prototype native renderer attachment on iOS and Android. Exercise one RN and one Lynx surface, background/resume and unmount/remount while the Tauri state remains alive.
4. Record actual platform startup/callback ownership and a go/no-go ADR. If a host-driven approach fails, investigate the Tauri-driven composition candidate without changing the producer.

## Meaningful verification

- Actual setup executes once and shared state survives repeated command calls and renderer remounts.
- An allowed plugin command executes; a denied command cannot execute its side effect.
- The same unchanged frontend receives a Rust event and the original command error.
- Standalone Tauri still runs after generated integration is deleted.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [x] Real baseline executes on desktop and on iOS/Android.
- [x] RN and Lynx coexistence and lifecycle are proved on both mobile platforms.
- [x] Source hashes, tool versions, logs and an architectural decision are recorded.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## Execution evidence — 2026-09-09

Implemented an ordinary independently runnable fixture and assertion-bearing native gates. Actual Tauri 2.11.5/Wry passes all ten scenarios on macOS arm64, iOS 26.4.1 arm64 Simulator and Android API 37 arm64/16 KB emulator: setup, State, AppHandle, async invocation, Rust events, plugin initialization, allowed plugin command, denied plugin side effects, original domain rejection and state preservation across WebView reload. Frontend and native AppHandle agree on application storage. Authored producer hashes remain unchanged. Mobile builds use the standard Tauri CLI and are Debug; no MockRuntime or extracted-command adapter is used.

- Commands: `nub --cwd packages/cli run test:runtime:baseline`, `test:runtime:ios`, `test:runtime:android` (select the simulator/emulator and native toolchains as documented in the fixture README).
- Evidence: [baseline report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-runtime-baseline-2026-09-09.json). Full build logs and result files remain under ignored `target/tauri-mobile-runtime/`.
- Regression checks: CLI build/typecheck and all six existing discovery scenarios passed; current unsupported-export diagnostics remain intact.
- The native composition and independence results below complete M6. Native Swift/Kotlin plugin support and production artifact integration are not established by this baseline.

## Android Lynx composition evidence — 2026-09-09

The generated Android `MainActivity` remains a subclass of Tauri's generated `TauriActivity`. A real Lynx 4.0.1 surface runs beside the original Tauri WebView. Maestro verifies five native-module calls across initial mount, background/resume and renderer destruction/remount. The process stays the same; Tauri state remains 45, setup/plugin initialization remain 1 and a denied plugin call never executes its side effect. The original frontend still passes all ten baseline scenarios. All authored producer hashes match before/after integration.

- Command: `nub --cwd packages/cli run test:runtime:compose:android` with the environment in [runtime verification](https://github.com/gronxb/tauri-native/blob/main/packages/cli/test/runtime/README.md).
- Evidence: [Android Lynx report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-composition-lynx-android-2026-09-09.json); full build/UI logs remain under `target/tauri-mobile-composition/lynx-android/`.
- The native probe deliberately enters the original WebView's real Tauri IPC and capabilities. This proves runtime coexistence, not a production native caller identity/dispatcher; that remains #42.
- Generated build integration sets 16 KB Rust link alignment and verifies every packaged native ELF. The first unaligned standard Tauri build displayed Android's compatibility-mode warning; it was corrected before the composed UI gate passed. The earlier standalone Android baseline ran on the 16 KB emulator but did not establish native 16 KB compatibility.
- Recreating the platform output while sharing Cargo caches exposed Tauri 2.11.5's missing output-directory invalidation. The reproducible gate clears only the target-specific Tauri crate build output before code generation.

Final verification and the architecture decision are recorded below. Production artifacts, native Swift/Kotlin plugin lifecycle, Expo integration and physical-device/Release coverage remain M7–M8 work.

## iOS Lynx composition evidence — 2026-09-09

The standard Tauri-generated `main.mm` still calls the sole `ffi::start_app()`. Generated native integration registers lifecycle observers and attaches a real Lynx 4.0.1 view to the retained WKWebView's parent; Tauri's UIApplication delegate remains in place. All five native JS probes and Maestro UI actions pass, including actual background/resume and destruction/remount. The process is unchanged, state stays 45 and setup/plugin initialization stay 1. Denied plugin side effects remain zero. The unchanged frontend also passes all ten baseline scenarios and authored producer hashes match.

- Command: `nub --cwd packages/cli run test:runtime:compose:ios` with `IOS_SIMULATOR_UDID` and the documented native toolchain.
- Evidence: [iOS Lynx report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-composition-lynx-ios-2026-09-09.json); logs under `target/tauri-mobile-composition/lynx-ios/`.
- Scope: Debug iPhone 16 arm64 Simulator / iOS 26.4.1. The native probe still uses the real WebView's IPC/caller identity; production dispatch and native plugin callback support remain M7 work.

Lynx is proved on both mobile platforms; the RN execution results follow below.

## React Native composition evidence — 2026-09-09

RN 0.86.3 now passes actual native UI, Tauri IPC, background/resume and Fabric surface removal/remount on both platforms. Android keeps `TauriActivity`, uses `ReactHost`/`ReactSurface`, and awaits surface stop before counting release. iOS keeps the standard Tauri bootstrap and delegate while `RCTReactNativeFactory` creates Fabric views. Each platform records five actual renderer probes, two surface generations, one release, unchanged process/state and single Tauri/plugin initialization. Plugin denial has zero side effects and the unchanged original frontend passes all ten baseline scenarios. Producer source hashes match.

- Commands: `nub --cwd packages/cli run test:runtime:compose:rn:ios` and `test:runtime:compose:rn:android` with the environments in runtime verification.
- Evidence: [RN iOS report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-composition-rn-ios-2026-09-09.json), [RN Android report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-composition-rn-android-2026-09-09.json). Full build/UI logs remain under `target/tauri-mobile-composition/react-native-{ios,android}/`.
- Generated Android integration includes the standard RN core Java TurboModule provider registration, matching Hermes/C++ runtime and 16 KB alignment. The APK stays Debug; only native debug symbols are stripped to fit emulator storage. Generated RN iOS targets require 16.4 while authored Tauri configuration is unchanged.
- Run all proof builds serially: concurrent Tauri CLI 2.11.4 mobile builds using this app identity overwrite shared connection options. This and dependency/bootstrap packaging findings are recorded in #42/#44/#45/#46.

## Completion and independent Tauri execution — 2026-09-09

All four native combinations passed. The generalized harness also reran both Lynx combinations successfully, with builds serialized. After deleting all four generated native integration directories, the ordinary desktop, iOS and Android gates each passed their ten scenarios again. All twelve authored producer file hashes match across the baseline, composition and final independent runs. State reaches 45 and application/plugin setup execute once on each standalone target.

- Evidence: [integration-removal report](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-composition-independence-2026-09-09.json). Reproduction is documented in [runtime verification](https://github.com/gronxb/tauri-native/blob/main/packages/cli/test/runtime/README.md); full final logs remain under `target/tauri-mobile-composition/independen*.log` and `target/tauri-mobile-runtime/`.
- Decision: [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md) accepts Tauri-driven composition: retain the sole Tauri platform bootstrap and attach RN/Lynx native surfaces through generated integration. Producer Rust, frontend, manifests and capabilities remain unchanged.
- Implementation commits on `main`: `dc3f517` (real Tauri baseline), `c08a6a9` (Android Lynx), `be7a782` (iOS Lynx), `6b5de39` (both RN platforms and final harness).

M6 is complete in its pinned Debug Simulator/emulator scope. Production direct native caller authorization and dispatch (#42), Swift/Kotlin plugins and OS callbacks (#43), portable artifacts (#44), package-owned RN/Expo and Lynx integration (#45/#46), and Release/device, relocation and adoption acceptance (#47) remain open. The current exporter compatibility scope and rejection diagnostics are unchanged.
