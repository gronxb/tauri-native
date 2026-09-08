# [M8] Gate release on standalone and composed Tauri Mobile parity

## Outcome

Validate the revised product contract in standalone Tauri Mobile, RN and Lynx rather than extrapolating from extracted Rust commands.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#43](https://github.com/gronxb/tauri-native/issues/43) (plan 019), [#45](https://github.com/gronxb/tauri-native/issues/45) (plan 021), [#46](https://github.com/gronxb/tauri-native/issues/46) (plan 022)
- Issue: [#47](https://github.com/gronxb/tauri-native/issues/47)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/023-tauri-mobile-composition-acceptance.md`

## Implementation

1. Run one useful feature with setup/state/AppHandle, async operations, Rust events, a mobile native plugin and capabilities in all six mobile combinations.
2. Compare results, denied side effects, persistence, initialization counts, native callbacks and lifecycle behavior; retain desktop independence checks.
3. Add required CI jobs, transferred-package verification and source-integrity checks with exact simulator/emulator/device evidence.
4. Update onboarding, migration, support matrix and release gates. Keep existing physical-device and independent adopter requirements open until demonstrated.

## Meaningful verification

- Same commands and frontend work in Tauri iOS/Android, RN iOS/Android and Lynx iOS/Android.
- Producer deletion, relaunch, permission denial, pending calls and teardown are exercised.
- Tests fail on any missing native scenario instead of skipping it.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] Six mobile executions and standalone desktop regression have assertion-bearing evidence.
- [ ] Package-only consumers need no producer source or Rust.
- [ ] No full mobile-composition release claim precedes the new gates.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
