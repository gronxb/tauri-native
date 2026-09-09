# [M7] Preserve Builder setup, State and AppHandle in generated integration

## Outcome

Replace command extraction for the runtime-preserving path with actual Tauri initialization and registered command dispatch.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — actual desktop and all four RN/Lynx mobile dispatch executions pass; production export acceptance remains open.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#41](https://github.com/gronxb/tauri-native/issues/41) (plan 017)
- Issue: [#42](https://github.com/gronxb/tauri-native/issues/42)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/018-retained-tauri-dispatch.md`

## Implementation

1. Preserve the producer Builder, manage/setup/plugin calls, native entry point and actual command macros in a disposable generated copy.
2. Connect async native requests to the actual Tauri invoke path with a declared caller identity and ordinary capability enforcement. Share the same State and AppHandle with the frontend.
3. Keep original initialization order and failures; define startup readiness and pending-request behavior during renderer teardown.
4. Ensure injected arguments are excluded from generated host payload types while ordinary user arguments retain serde behavior.

## Meaningful verification

- Two callers mutate/read the same State; startup and plugin setup execute once.
- Setup failure is observable and cannot produce a successful artifact/runtime-ready signal.
- Original errors, async cancellation/result suppression and registered-command restrictions survive both call paths.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [x] Real Tauri dispatch is used by both direct native and embedded calls.
- [x] No production mock runtime, fabricated handle or duplicate state registry is used.
- [ ] Export success/failure preserves producer source and standalone builds.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## M6 handoff

The executable M6 probes retain actual Tauri startup and proxy native requests through the original WebView IPC. Their fixed probe inherits that WebView's identity; it is deliberately not a production arbitrary-command bridge. Replace this test wiring with a declared native caller and real Tauri capability checks, including denial before side effects, shared state, readiness and late-result suppression after renderer teardown. Preserve the current exporter rejection checks until the production path has native evidence.

## Implementation progress — 2026-09-09

The generated runtime now keeps the original Builder, setup, registered commands and Tauri dependencies. Its ABI 3 native sessions call actual Tauri `on_message` in Rust, with an explicit artifact-owned caller policy intersected with the named WebView's existing capabilities. No JavaScript evaluation is used for native dispatch, and no invoke key leaves Rust. [ADR 0008](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0008-retained-native-caller-boundary.md) records authorization, readiness and teardown semantics.

The real macOS Wry gate passes twelve scenarios, including native/embedded shared State, setup/plugin initialization once, original rejection, real plugin denial without side effects, registered-command restrictions, cancellation and retired sessions while Rust work remains active. A separate actual failed setup preserves the original error and never advertises readiness. Source hashes match across preparation, execution and failure. Command models exclude injected State/AppHandle from host payloads. Existing adapter mode remains separate.

Command: `nub --cwd packages/cli run test:runtime:retained`. The [desktop evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-desktop-2026-09-09.json) is recorded; full logs are under `target/retained-runtime/`. Broader native callback integration and source-free export acceptance remain open; this issue is not complete from dispatch evidence alone.

Package-owned Android JNI/Java and iOS Objective-C++ session clients now use the same ABI 3 Rust dispatch. The [Android Lynx gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-lynx-android-2026-09-09.json) passes five native UI calls, remount, background/resume, both caller-policy and actual Tauri capability denial, unchanged frontend/state and all packaged ELF alignment checks. The generated copy also preserves authored native Manifest/Info.plist/source files while excluding build caches and previous tauri-native exports. Existing CLI/package regressions pass (53 tests).

All mobile gates must run serially, including UI: Tauri CLI shares app-identity options across platforms, and Maestro shares a local driver port. A repository-wide mobile test lock and bounded device/driver commands prevent overlapping gates or indefinite waits on an unresponsive device. Simulator/emulator infrastructure failures remain failures until a complete assertion-bearing rerun passes.

All four retained mobile combinations now pass: [RN Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-rn-android-2026-09-09.json), [RN iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-rn-ios-2026-09-09.json), [Lynx Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-lynx-android-2026-09-09.json) and [Lynx iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-dispatch-lynx-ios-2026-09-09.json). Each completes five actual renderer calls, generation 2 with one retired session/surface, background/resume in the same Tauri process, unchanged state 45 and setup/plugin counts of one. Both native policy and original plugin capability denial precede side effects. Failed infrastructure attempts and the iOS existing-output rename failure are described separately in the evidence; final serial executions pass.

This validates the runtime/native-session layer on Debug simulator/emulator builds. It does not close #43–#47 or establish source-free exports, native event/channel delivery, packaged SDK composition or Release/device/adopter acceptance.
