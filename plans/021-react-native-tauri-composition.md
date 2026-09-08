# [M8] Compose React Native and Expo with retained Tauri Mobile

## Outcome

RN and Expo add native UI and command access while preserving the ordinary Tauri Mobile application.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
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
