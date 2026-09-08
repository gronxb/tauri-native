# [M8] Compose Lynx with retained Tauri Mobile

## Outcome

Lynx adds native rendering while using the same retained Tauri runtime artifacts and semantics as RN.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#41](https://github.com/gronxb/tauri-native/issues/41) (plan 017), [#44](https://github.com/gronxb/tauri-native/issues/44) (plan 020)
- Issue: [#46](https://github.com/gronxb/tauri-native/issues/46)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/022-lynx-tauri-composition.md`

## Implementation

1. Implement package-owned Lynx surface attachment, autolinking and lifecycle cooperation with the selected startup owner.
2. Route NativeModule calls through the actual Tauri app and preserve background scripting requirements.
3. Attach TauriView to the retained app with explicit state scope and document/request cleanup.
4. Use the same producer and platform artifact format as RN; no Lynx-specific producer branches.

## Meaningful verification

- Lynx background calls and embedded frontend calls share state across view/runtime replacement.
- Native plugin permissions, callbacks and deep links survive background/resume without duplicates.
- Relocated source-free consumers build and run on both platforms.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] iOS and Android Lynx Release executions pass.
- [ ] Same artifact contract and Tauri command/permission semantics as RN are demonstrated.
- [ ] Standalone Tauri Mobile and producer source are preserved.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
