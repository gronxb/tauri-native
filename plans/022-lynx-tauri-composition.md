# [M8] Compose Lynx with retained Tauri Mobile

## Outcome

Lynx adds native rendering while using the same retained Tauri runtime artifacts and semantics as RN.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS
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

- [x] iOS and Android Lynx Release executions pass (packed SDK gates with explicit consumer attachment; automatic composition remains open).
- [ ] Same artifact contract and Tauri command/permission semantics as RN are demonstrated.
- [ ] Standalone Tauri Mobile and producer source are preserved.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## M6 handoff

Lynx 4.0.1 native views now execute beside the real Tauri WebView on both platforms with unchanged producer sources. iOS attaches to the existing view parent without replacing the Tauri delegate; Android uses `TauriActivity.onWebViewCreate`. Actual background JS calls, view destruction/remount and background/resume preserve state and single Tauri/plugin initialization. Turn these version-pinned attachment seams into package-owned integration with explicit readiness and cleanup; production autolinking, native plugins, direct caller permissions and relocated artifacts remain required.

## Package integration progress — 2026-09-09

The package now provides an explicit `@tauri-native/lynx/retained` entry point,
an Android `TauriNativeRuntime` module and `TauriLynxHost`. Each surface receives
its own native scope through Lynx's module parameter API. Background calls are
marshalled to the real Tauri platform session on main; renderer replacement
retires requests/listeners before destroying the old Lynx engine. Backgrounding
and permission dialogs keep the session alive. No producer imports, Rust state,
command registry or second Tauri bootstrap are introduced.

Four JS scenarios cover original structured command errors/concurrent results,
cancelled request retirement, an event batch arriving before a new listener's
acknowledgement, close during pending registration/permission work, and stream
overflow/recovery versus origin revocation. The packed SDK native gate is
`packages/lynx/test/retained-android.ts`; it builds from a relocated format 2
Release artifact without Rust, uses a non-debuggable APK with R8 optimization,
checks every packaged native ABI/16 KB segment and exercises real Lynx UI.

The complete arm64 Android execution now passes with the actual packed SDK:
the unchanged frontend baseline, shared value 45/setup counts 1, separate Tauri
ACL/native caller denial, OS permission denial/grant, native location save and
event, background deep link, renderer replacement and exactly one fresh event.
The original Activity receives both deep-link Intents; the process stays the
same, native listeners reach zero at replacement and one after registration.
All eleven packaged ELF libraries and APK alignment pass. [Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json).

The gate pins application ABIs to the actual exported slices and includes Lynx's
Gson dependency. It verifies a non-debuggable APK and an obfuscated SDK host;
earlier native telemetry builds with `isDebuggable=true` do not establish this
optimization scope. A preceding resume assertion failed; same-APK diagnostics
passed, and the corrected complete gate waits for a new `onStop` after Home
instead of accepting a pause count left by OS permission dialogs. Failure and
completed evidence are distinguished in the receipt. Six package JS tests,
typechecks and the 42-file npm tarball check pass.

The matching iOS package now provides `TNLynxHost`, a scoped NativeModule and a
local CocoaPods integration. The packed SDK passes all seven native UI flows in
a relocated arm64 Release simulator build without Rust: original frontend
baseline, native/Tauri/OS permission decisions, location save, background deep
links, renderer replacement and fresh events. Native listeners reach zero at
replacement and one after registration. Removing Lynx leaves zero native
listeners and the original Tauri frontend still handles commands in the same
process with the original `AppDelegate`. The denial-to-grant test deliberately
relaunches after resetting iOS privacy; process preservation is asserted across
the subsequent background/remount/removal sequence. [iOS execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-ios-2026-09-09.json).

CocoaPods' global `-ObjC` initially exposed repeated transitive Swift objects in
the unchanged Tauri archive. The package's post-install helper scopes
`-force_load` to the five pinned renderer libraries, preserving Objective-C
categories and the original runtime bytes. It rejects extra pods or framework
linkage pending compatibility evidence. The preceding link and configuration
failures are recorded separately from the successful run. Six JS tests,
typechecks and the 48-file package check pass.

Automatic composition/autolinking, retained `TauriView`, RN parity and complete
release/device/adopter evidence remain open. iOS session-open failures currently
expose `runtime_error` with the platform client's NSError description; aligning
that diagnostic with Android remains required. Command/event/permission errors
retain their original structured responses. The test
fixture currently owns the consumer layout/bootstrap hooks and telemetry;
the package owns the actual NativeModule, renderer and session lifecycle.
Native renderer destruction while an OS permission callback is pending remains
required separately; the new JS close scenario alone does not prove that case.
