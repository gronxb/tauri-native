# [M8] Compose Lynx with retained Tauri Mobile

## Outcome

Lynx adds native rendering while using the same retained Tauri runtime artifacts and semantics as RN.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — packed automatic composition passes on iOS and Android, including a fresh Android export; remaining M8 lifecycle/view/parity gates stay open.
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

- [x] iOS and Android Lynx Release automatic-composition executions pass, including unmodified generated startup/default layouts; repeated startup reliability and remaining M8 acceptance stay open.
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

## Android automatic composition (2026-09-09)

`@tauri-native/lynx/compose` now generates a native consumer from a copied format
2 artifact and offline bundle without React Native or Rust dependencies. The
original `MainActivity` becomes open only in the generated copy, retaining its
upstream edge-to-edge setup and superclass startup. Generated `TauriNativeActivity`
owns Lynx initialization, actual runtime/document readiness, attachment and
resume/pause/destruction forwarding. The original Tauri/Wry Activity continues
to own native plugins and Intents. Default Lynx layout respects system-bar/cutout
insets; native consumer hooks support explicit layout and readiness customization.

Both SDKs share output validation, generated-file ownership and atomic replacement
without depending on each other. The RN refactor preserves identical generated
files and receipts on Android (98 files) and iOS (38 files) relative to `c4409fa`.
Ten existing RN configuration scenarios and nine Lynx JS/configuration scenarios
pass. The Lynx public API typecheck and 53-file package check also pass.

The first Release/R8 attempt passed the native build and all eleven libraries'
16 KB alignment, then failed while waiting for the original Tauri baseline.
The next run adds readiness telemetry to the acceptance subclass; it does not
change production startup. The complete second run passes nine UI flows, including the unmodified generated
Activity in a separate clean-installed APK. Both APKs are non-debuggable and keep
the same eleven native libraries. [Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-android-2026-09-09.json). The
initial failure's root cause is unconfirmed. This gate currently consumes an
older producer-deleted export; fresh latest-exporter validation is required
before claiming startup reliability.

The gate now includes Lynx removal with original frontend continuity and a second
clean-installed Release APK running the unmodified generated Activity/default
layout, with no acceptance subclass. iOS automatic composition, third-party
autolinking, retained TauriView, consistent session-open diagnostics, pending OS
callback renderer retirement and full parity/device/adopter acceptance remain
open. This increment does not complete #46 or authorize a package release.

The fresh current-exporter Android artifact now passes the complete native gate and both packed SDK consumers: [fresh Android export and SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-android-composition-2026-09-09.json). Lynx passes all nine UI flows with the same immutable artifact as RN, including a separate non-debuggable APK using the unmodified generated Activity. Original producer hashes and the exported artifact remain unchanged during consumption. This supplies the missing latest-exporter execution; it does not establish the earlier baseline failure's cause or repeated cold-start reliability.

## iOS automatic composition (2026-09-10)

The packed `composeIos` entry point generates the original Xcode consumer,
offline bundle and CocoaPods integration on macOS. `TNLynxComposition` observes
launch before the unchanged `ffi::start_app()`, waits for actual runtime/document
readiness and attaches Lynx inside the original parent's safe area. The original
Tauri delegate, window, root controller, plugin setup and archive remain intact.
The minimum OS is the highest of 14.0 and all explicit original targets.

The complete gate passes two pod installations with regeneration between them
and nine source-free Release UI flows. An acceptance subclass supplies layout,
baseline readiness and telemetry for permissions, location, events, background
links and renderer replacement/removal. Native listeners reach zero on retirement,
and the original frontend continues in the same process after Lynx removal.
A second clean-installed Release app uses unmodified generated startup/default
layout and contains no acceptance telemetry. [Lynx iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-ios-2026-09-10.json).

Shared Apple metadata validation and CocoaPods receipt tracking preserve existing
RN iOS/Android and Lynx Android output bytes. Thirteen existing configuration
scenarios and four new iOS scenarios pass, alongside both SDK package checks and
packed public API typechecks. The earlier iOS build had no terminal output or
completion report when its session/process disappeared; it remains incomplete
evidence, separate from the completed rerun.

This consumes the existing producer-deleted iOS archive, with no new Rust export.
Third-party autolinking, retained TauriView, consistent session-open diagnostics,
pending OS callback renderer retirement, repeated Android startup reliability and
full parity/device/adopter acceptance remain open. #46 stays IN PROGRESS.
