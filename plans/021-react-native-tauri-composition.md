# [M8] Compose React Native and Expo with retained Tauri Mobile

## Outcome

RN and Expo add native UI and command access while preserving the ordinary Tauri Mobile application.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — packed RN iOS/Android Release execution and automatic composition pass for the pinned standard Tauri projects; single-original-view attachment also has native evidence; Expo and broader integration remain open.
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

- [x] iOS and Android RN Release executions pass with copied runtime artifacts (packed SDK automatic composition, including unmodified generated startup/default layouts; Expo and broader source forms remain open).
- [ ] Ordinary standalone Tauri Mobile remains independently runnable.
- [ ] Existing limited-adapter users have an explicit migration path.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## M6 handoff

The iOS prototype uses `RCTReactNativeFactory` and a real Fabric root view under the retained Tauri view hierarchy; it does not install an RN UIApplication delegate. The Android candidate keeps `TauriActivity` and uses `ReactHost`/`ReactSurface`, forwarding RN resume/pause and awaiting asynchronous surface stop before remount. Carry RN's core TurboModule provider registration and matching Hermes/C++ dependencies into generated native integration.

The probes use RN 0.86.3 and an offline JS bundle with a test-only callback module. They do not establish Expo native module/autolinking or lifecycle coverage, production TurboModule contracts, Activity recreation, deep links, permission results or Release artifacts. Verify those scenarios in this issue rather than treating M6 surface coexistence as package support.

## Android SDK execution (2026-09-09)

The package now provides `@tauri-native/react-native/retained`, a generated
`TauriNativeRuntime` TurboModule and `TauriReactHost` owning a Fabric surface and
independent RN engine. RN and Lynx ship the same session client without depending
on each other. The original Tauri Activity, WebView, native plugins and bootstrap
remain in place; no producer bridge is added. The host retires native sessions
before RN engine destruction, forwards lifecycle/intents and owns AndroidX back
dispatch with fallback to the original dispatcher.

`packages/react-native/test/retained-android.ts` packs the actual SDK, bundles its
compiled public entry and builds a relocated format 2 arm64 consumer without Rust
on PATH. RN/codegen 0.86.3 and Hermes 250829098.0.17 execute in a non-debuggable
Release/R8 APK. All eleven ELF libraries and APK 16 KB alignment pass. Eight
JUnit flows cover shared state/setup, separate Tauri/native/OS permission
decisions, actual Kotlin geolocation/save/events, RN BackHandler and Linking,
background deep links, RN engine replacement and removal. Native listeners go
from one to zero to one at replacement, then zero at removal. The original
frontend still handles commands in the same process after RN is destroyed.
[Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json).

The SDK includes only its own `appmodules` native library; pinned upstream AARs
supply RN/Hermes dependencies. RN/codegen version mismatches fail before codegen.
The original AGP 8.11 K2 lint crashes on applied Kotlin Gradle scripts
([upstream issue](https://issuetracker.google.com/issues/430991549)); the consumer
selects its K1 analyzer while retaining Release lint checks. Earlier failed
builds and this toolchain constraint are recorded separately in the evidence.

Consumer fixtures still supply attachment/layout and Activity forwarding hooks.
This is not Expo CNG or automatic integration. RN iOS, retained TauriView,
Activity recreation, RN-owned permissions, renderer destruction during a pending
OS permission callback, migration and full parity/device/adopter gates remain
required. The input artifact is unchanged; this consumption run does not re-export
Rust or re-prove the later Android origin-capture fix. No acceptance item is
closed by the Android-only result.

## iOS SDK execution (2026-09-09)

The packed iOS SDK now provides `TNReactHost`, an isolated generated TurboModule
and CocoaPods integration helpers. It uses RN/codegen 0.86.3 with matching
prebuilt React/Hermes frameworks. The consumer requires iOS 16.4; the original
producer and immutable artifact keep their deployment settings. The ordinary
Tauri bootstrap, `AppDelegate`, native session client and archive remain in place.

`packages/react-native/test/retained-ios.ts` passes seven Release simulator UI
flows after relocation, with no Rust toolchain access: separate Tauri/native/OS
permission decisions, real Swift geolocation/save/events, background deep links,
RN engine replacement and removal. Setup/state stay shared, native listeners go
to zero before replacement and after removal, and fresh events reach only the
new renderer. Own-process thread inspection finds one RN JS thread after
replacement and zero after removal. The original frontend continues handling
commands in the same process with the original delegate.
[Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-2026-09-09.json).

The first link failed because global `-ObjC` forced duplicate Swift objects in
the original Tauri archive. The helper now loads only the three RN static
libraries explicitly; the RN frameworks are dynamic and Tauri archive bytes
remain identical. An actual lifecycle assertion also found that RN constructs a
different module instance from the provider placeholder; the factory now tracks
actual instances through `getModuleInstanceFromClass`, closing their sessions
before RN invalidation. Both failures are recorded separately from final passes.
Unsupported framework configuration and RN 0.87.1 produce explicit diagnostics
without overwriting the prior configuration/generated code in the checked cases.

The iOS consumer fixture still owns attachment/layout and telemetry. RN Linking
URL forwarding, consistent structured session-open diagnostics, Expo CNG,
automatic composition/autolinking, retained TauriView, pending-OS-callback
renderer retirement and full lifecycle/parity/device/adopter gates remain open.
The two platform SDK executions do not complete this issue or authorize a release.

## Android automatic composition (2026-09-09)

`@tauri-native/react-native/compose` now generates a native consumer from a
validated copied artifact and an offline RN bundle. The original `MainActivity`
keeps its implementation and becomes open only in the generated copy; a generated
subclass owns RN startup, document readiness, attachment and lifecycle forwarding.
The original Tauri/Wry Activity and native plugin bootstrap remain in the chain.
Both SDKs now ship the same source-free `retained-artifacts` reader.

The revised packed gate passes ten Release/R8 UI flows without Rust. An acceptance
subclass supplies only layout, baseline readiness and telemetry for shared state,
permissions, native plugins/events, BackHandler/Linking and RN replacement/removal.
A second clean-installed APK removes that subclass and executes the unmodified
generated Activity/default layout, including readiness, state, ACL, BackHandler
and deep links. Both APKs are non-debuggable, have identical eleven native
libraries and pass 16 KB alignment.
[Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-android-2026-09-09.json).

The first default-layout run exposed text behind the system status bar: the
original Tauri `enableEdgeToEdge` was correctly preserved but RN's container
needed system-bar/cutout insets. The SDK applies those insets without changing
the original window or WebView. The failed run and corrected pass are separate
evidence. Six configuration tests cover regeneration, upgrades, corrupt inputs,
owner/version conflicts, edited files, aliases/symlinks and publication/rollback
failure preservation. These metadata/fault-injection cases are distinct from
native execution. All nineteen RN/shared JS tests and public package typechecks
pass. No producer or input artifact files change.

This automatic path supports the pinned standard Android Activity and a bundled
RN 0.86.3 renderer. iOS/Lynx automatic composition, Expo CNG, third-party module
autolinking, custom lifecycle owners, retained TauriView, remaining permission/
lifecycle scenarios and complete parity/device/adopter evidence remain open.
This increment does not close #45 or authorize package publication.

## iOS automatic composition (2026-09-09)

The packed `composeIos` entry point now generates the original Xcode consumer,
offline bundle and CocoaPods integration on macOS. `TNReactComposition` registers
launch observation before the unchanged `ffi::start_app()`, waits for actual
runtime/document readiness and attaches RN within the original parent's safe
area. Tauri retains its application delegate, window, root controller and native
plugins. The generated consumer uses the highest of RN's 16.4 minimum and all
explicit original deployment targets; the immutable artifact remains unchanged.

The native gate executes pod installation, regeneration and a second successful
pod installation before building Release without Rust. SDK receipt tracking
allows CocoaPods' project rewrite while detecting existing or concurrent edits
to other generated files. Four macOS configuration scenarios cover preservation,
higher deployment targets, corrupt/conflicting inputs and CocoaPods ownership.
The shared generator refactor produces the same 98 Android files and identical
receipt as `c8051fd`; Android native startup code is unchanged.

Nine iOS UI flows pass. An acceptance subclass supplies only layout, baseline
readiness and telemetry for original state/setup, Swift plugins, permissions,
Tauri events, background deep links and RN replacement/removal. Native listeners
retire before replacement and removal; the RN JS thread exits after removal while
the original frontend keeps working in the same process with `AppDelegate`.
A second clean-installed Release app executes the unmodified generated main and
default SDK layout, without acceptance hooks, and passes shared state, ACL and
original Tauri deep-link/event checks.
[Execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-ios-2026-09-09.json).

Automatic composition now has scoped native evidence on both RN platforms.
Expo CNG, third-party autolinking, custom lifecycle owners, retained TauriView,
iOS RN Linking, consistent session-open diagnostics, pending OS callback renderer
retirement, migration and full parity/device/adopter acceptance remain open.
This consumes an existing producer-deleted export; it is not a fresh export or
a package release. #45 remains IN PROGRESS.

The RN Android automatic composer now passes all ten native UI flows against a fresh current-exporter artifact also consumed by Lynx: [fresh Android export and SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-android-composition-2026-09-09.json). The original producer hashes match, the disposable producer is deleted, and both non-debuggable Release/R8 APKs preserve all eleven native library bytes. Original Tauri state/setup, permissions, events, BackHandler/Linking and engine replacement/removal pass. Shared Apple metadata/receipt refactoring additionally preserves the existing RN Android/iOS generated outputs; this does not add Expo or pending-OS-callback renderer-retirement acceptance.

Apple project validation and CocoaPods receipt tracking are now shared with the Lynx composer without either package depending on the other. Generation remains byte-identical for RN Android (98 files), RN iOS (38 files) and Lynx Android (98 files) relative to `c53ec2d`. Thirteen existing composer scenarios plus four new Lynx iOS scenarios pass; current tarball checks contain 103 RN files and 56 Lynx files, and both packed public APIs typecheck. The actual shared receipt path is exercised by two successful Lynx pod installations and nine native flows: [Lynx iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-ios-2026-09-10.json). No new RN iOS native run is claimed for this extraction.

## Pending permission and session diagnostics — 2026-09-11

[SDK permission-retirement evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-sdk-permission-retirement-2026-09-11.json) records 41 packed Release UI flows across RN/Lynx iOS/Android. The actual
SDK renderer is retired while the original Tauri geolocation OS dialog is pending.
Listeners reach zero, Tauri stays ready, and after grant the old continuation
cannot save its sentinel note. A new renderer saves one real location note;
shared state/setup, events, later replacement/removal and original frontend
continuity pass. Each gate also clean-installs an app with unmodified generated
startup/default layout and no native acceptance class.

All four SDK paths preserve the original undeclared caller's error code/message.
The additive iOS NSError response field is captured by a fresh unchanged-producer
export with twelve native UI flows: [fresh iOS export evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-ios-2026-09-10.json). Older iOS exports retain the legacy
error fallback. iOS denial-to-grant explicitly resets privacy and relaunches;
retirement/grant/background/removal then keep one process. Evidence records the
initial Android logcat collection failure separately from the corrected full run.
This observes absence of stale saved notes, not a count of retired JS callbacks.

Expo CNG, third-party autolinking, retained TauriView/navigation, RN iOS Linking, Activity recreation/RN-owned permissions, broader source forms/native channels, complete parity/CI/migration, physical devices and independent adopters remain open. No issue or release is closed by this increment.

## RN iOS URL delivery — 2026-09-11

The packed RN composer/host now preserves the original Tauri AppDelegate object
and forwards its URL/activity callbacks to the current RN engine after calling
the original implementation, retaining its return value. Removal restores the
SDK's own wrappers; the original Tauri handler processes subsequent URLs.
Eighteen source-free arm64 Release UI flows pass: [RN iOS Linking evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-linking-2026-09-11.json). They cover exact URL
delivery, repeated identical URLs, background/resume, engine replacement,
URL-driven process startup and getInitialURL across reload/later events. A
controlled attachment delay proves a URL arriving after normal app startup stays
an event instead of becoming the initial URL. Original state/setup, real plugin
permissions, pending-permission retirement, notes and listener/thread cleanup
still pass, including a second app with unmodified generated startup/default
layout and no acceptance class. The original producer and existing artifact
remain unchanged; no new Rust export or Android execution is claimed.

The prior generated Release app reproduced the gap: Tauri received one URL and
one event while RN Linking received none. Native browsing/unrelated activity
injection now also preserves Tauri's YES/NO results without adding restoration
callbacks; this is not OS associated-domain or live Universal Link acceptance.
Those checks, Expo CNG, third-party autolinking, retained TauriView/navigation,
custom source/lifecycle owners, complete parity/CI/migration, physical devices
and independent adopters remain open. This increment does not close the issue
or authorize a package release.

## Retained RN document attachment — 2026-09-11

`TauriView` from `@tauri-native/react-native/retained` now borrows the original
Tauri WebView on iOS and Android. The generated consumer supplies the view;
the producer's Rust, frontend, Cargo/configuration, capabilities and plugin
sources remain unchanged. Original IPC and direct RN sessions share one Tauri
application, managed state and native plugins. The component does not create,
reload or navigate a WebView and does not replace native delegates/clients.

[Native Release evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-rn-view-2026-09-11.json) records 25 iOS Simulator and 18 Android
emulator UI flows from packed SDKs. Both the acceptance subclass and a
second clean-installed app with unmodified generated startup/default layout
execute the public component. The original frontend saves a real location note,
and RN receives its event and reads both notes from Tauri. Capability denial,
competing attachment, component remount, engine replacement and removal pass.
The nonpersistent test document token, native delegates/clients, state 45 and
single app/plugin setup remain intact. Closing RN restores the original parent,
retires native listeners and destroys its engine; the original frontend remains
interactive. iOS Linking warm/repeated/cold/delayed URL and callback restoration
checks, Android BackHandler/Linking, and pending OS permission retirement all
remain in the passing gates.

The contract is one original WebView and one retained RN host. Only one mounted
component may borrow the view. Fabric ownership follows the mounted surface or
ReactContext generation, including recycled native components; retiring an old
renderer cannot detach a new renderer's view. A second attachment reports
`view_in_use`; missing/retired owners report `view_unavailable`. Remount a failed
component before retrying. The existing native host initializers remain callable
for direct sessions; manual view integration supplies the original WebView.
Retained component codegen stays separate from the format 1 entry point.

One failed iOS build exposed a missing generated-header search root. A later
remount UI assertion targeted content below the embedded viewport; final tests
scroll inside the original WebView without removing assertions. Logs and the
latter acceptance binary are preserved separately. The first Android Fabric
startup also exposed missing standard RN Folly compiler options, which the final Android CMake now applies to generated props
and their consumers. Its APK and crash dump are preserved. The iOS and Android
tarballs differ only in this Android-specific CMake file; iOS native/JS/composer
files are unchanged. No authored Tauri source or runtime artifact was changed
to make these checks pass.

Expo CNG, third-party autolinking, full navigation/history/back/rotation and
Activity recreation/RN-owned permissions, OS Universal Link association,
custom layout/lifecycle owners, complete parity/CI/migration, physical devices
and independent adopters remain open. No issue or release gate is closed.

## RN-owned Android OS permissions — 2026-09-11

`TauriNativeActivity` implements RN's `PermissionAwareActivity`. The package
registers an Activity-scoped AndroidX permission launcher before STARTED,
independently from the original Tauri PluginManager registrations. One queue
retains each RN request's original code, ordered permissions and listener.
Delivery waits for Activity resume. Each RN generation has its own scope;
reload/close removes queued requests and drops an in-flight listener while
allowing the outstanding OS dialog to finish. A retired request cannot deliver
to a replacement engine's reused request code. Manual composition passes one
`TauriReactPermissions` router per Activity to the host and forwards the RN
permission overload; original Activity callbacks remain in the super chain.

[Native Release evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-rn-permissions-2026-09-11.json) records 24 Android emulator UI flows from
a 117-file packed SDK and a relocated source-free Release/R8 consumer. The
original 18 view, Tauri permission, BackHandler, Linking and teardown flows
still pass. Six additional flows execute RN single denial, multiple grant,
concurrent native permission results, retirement with a real OS dialog pending,
result delivery after reload, and the unmodified generated Activity without
acceptance hooks. Native telemetry observes no invocation of the old listener,
zero sentinel notes, one current native event subscription, and only the new
listener receiving a later request with the same RN code zero. CAMERA and
RECORD_AUDIO are intentionally absent from the unchanged manifest, so their
native requests return denial without a dialog; these exercise queue/result
ownership without adding producer permissions. RN location grants are visible
to the original geolocation plugin and a real GPS note/save/event succeeds.

RN-only denial returns `denied` in RN and `prompt` in original Tauri 2.11.5:
Tauri reads its own `PluginPermStates` cache for denied permissions. The SDK
preserves this upstream behavior, does not populate that cache, and never
converts a denial into a grant. Actual Tauri-owned denial/rationale handling
continues to pass its existing scenario. All 14 authored producer files and
the complete original runtime artifact inventory remain unchanged. One initial
build rejected a lambda for RN's Kotlin `ReactInstanceEventListener`; the final
code implements that interface explicitly. The failed build/logs are preserved
separately and establish no native acceptance. No iOS executable code changed
or iOS rerun is claimed in this Android increment.

This provides the Activity permission contract used by RN and required by
Expo's permission service; it does not establish Expo integration. Expo CNG,
third-party native modules/autolinking, Activity recreation, broader navigation/
lifecycle/source owners, OS Universal Link association, full parity/CI/migration
and physical device/independent-adopter evidence remain open.
