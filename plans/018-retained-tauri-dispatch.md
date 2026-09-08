# [M7] Preserve Builder setup, State and AppHandle in generated integration

## Outcome

Replace command extraction for the runtime-preserving path with actual Tauri initialization and registered command dispatch.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
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

- [ ] Real Tauri dispatch is used by both direct native and embedded calls.
- [ ] No production mock runtime, fabricated handle or duplicate state registry is used.
- [ ] Export success/failure preserves producer source and standalone builds.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
