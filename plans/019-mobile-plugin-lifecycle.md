# [M7] Preserve native mobile plugins, permissions and OS callbacks

## Outcome

Mobile-supported Tauri plugins must keep their native implementation and authorization behavior in composed apps.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#41](https://github.com/gronxb/tauri-native/issues/41) (plan 017), [#42](https://github.com/gronxb/tauri-native/issues/42) (plan 018)
- Issue: [#43](https://github.com/gronxb/tauri-native/issues/43)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/019-mobile-plugin-lifecycle.md`

## Implementation

1. Package/register a representative Swift plugin and Kotlin plugin using the upstream plugin contract.
2. Preserve plugin setup and configuration, permission requests/results, Activity/UIApplication callbacks, deep links, background/resume and native resource cleanup.
3. Carry Tauri capabilities and scopes for frontend and direct native callers; do not grant a wildcard to make integration work.
4. Document a verified plugin support matrix and reject unsupported platform dependencies or manifest conflicts before publishing an export.

## Meaningful verification

- Allowed native action returns platform data; denied action has no side effect.
- OS permission denial and later grant both reach the caller correctly.
- A native callback and deep link arrive once after resume, including renderer remount.
- An unsupported desktop-only plugin receives a precise diagnostic.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] Real Swift/Kotlin implementations pass on standalone and composed iOS/Android.
- [ ] Tauri ACL and OS permissions are independently verified.
- [ ] Lifecycle and native dependency requirements are explicit and reproducible.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
