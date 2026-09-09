# [M7] Preserve native mobile plugins, permissions and OS callbacks

## Outcome

Mobile-supported Tauri plugins must keep their native implementation and authorization behavior in composed apps.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — ordinary desktop/iOS/Android and source-free native iOS/Android plugin calls pass; RN/Lynx package-level acceptance remains open.
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

## Implementation progress — 2026-09-09

`packages/cli/test/fixtures/mobile-plugin-tauri` is an ordinary location-note application using official geolocation 2.3.3 and deep-link 2.4.10. It keeps its own Builder/setup/State, Tauri capabilities, iOS usage description and custom URL scheme, with no renderer imports or maintained host bridge. Notes are saved from actual native location results and persisted in application storage. The desktop runtime baseline passes all ten existing scenarios; [evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-desktop-2026-09-09.json) establishes desktop independence only.

The new `test:runtime:plugins:ios` and `test:runtime:plugins:android` gates require separate Tauri ACL denial, OS permission denial and later UI grant, denied location without a saved note, native position callback, background/deep-link delivery once and process-relaunch persistence. Both complete mobile gates now pass on the iOS 26.4 arm64 Simulator and Android API 37 arm64 16 KB emulator, using real Swift/Kotlin geolocation callbacks, OS permission UI and original native deep-link lifecycle. Evidence: [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-ios-2026-09-09.json), [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-android-2026-09-09.json). Android reports a retryable first denial as `prompt-with-rationale`; iOS reports `denied`. The assertions preserve those upstream semantics. Fresh native scaffolds invalidate Tauri/geolocation/deep-link build-script output so regenerated permission and URL declarations cannot reuse stale results. Composed callers, pending-callback retirement and production dependency/manifest diagnostics remain open.


The format 2 Android artifact now also passes native Kotlin plugin calls through the package-owned ABI 3 session after producer deletion. A real permission request remains pending when its session is closed, settles exactly once as `session_closed`, and the later UI grant is visible to the new session without delivering the OS callback to the retired one. Location save, native remount, original deep-link Activity routing and persistence pass. [Native artifact evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-android-2026-09-09.json). The matching [iOS artifact gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-ios-2026-09-09.json) now passes the same scenarios through the real Swift geolocation implementation and original Tauri UIApplication/deep-link lifecycle. Both paths preserve original permission usage declarations and URL schemes. RN/Lynx package-level plugin/lifecycle acceptance remains open.
