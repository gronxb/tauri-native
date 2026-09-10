# [M7] Preserve native mobile plugins, permissions and OS callbacks

## Outcome

Mobile-supported Tauri plugins must keep their native implementation and authorization behavior in composed apps.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — ordinary desktop/iOS/Android, source-free native plugins and packed Lynx/RN iOS/Android execution pass; complete package lifecycle acceptance remains open.
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
4. Document a verified plugin support matrix and reject unsupported platform dependencies or manifest conflicts before publishing an export. Resolve the selected mobile dependency graph before diagnosing a desktop-only plugin, preserving a producer's valid inactive desktop dependency.

## Meaningful verification

- Allowed native action returns platform data; denied action has no side effect.
- OS permission denial and later grant both reach the caller correctly.
- A native callback and deep link arrive once after resume, including renderer remount.
- An unsupported desktop-only plugin receives a precise diagnostic.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [x] Real Swift/Kotlin implementations pass on standalone and composed iOS/Android.
- [x] Tauri ACL and OS permissions are independently verified.
- [ ] Lifecycle and native dependency requirements are explicit and reproducible.

The first two items are satisfied for geolocation 2.3.3 and deep-link 2.4.10,
using the original standalone gates and packed RN/Lynx Release gates linked in
the [verified support matrix](../docs/retained-support.md). The
[evidence audit](../docs/evidence/retained-support-audit-2026-09-11.json) checks
their common producer hashes and assertion-bearing results. Activity recreation,
broader native lifecycle/source forms remain open; this does not close the issue
or establish release parity. Target-specific selection now has the separate
native evidence below.

## Target and feature dependency selection — 2026-09-11

The exporter resolves the selected Cargo targets with default/configured
features before validating native plugins. Inactive desktop dependencies remain
in the producer; active unverified plugins fail with name/version/target.
[Evidence](../docs/evidence/retained-target-dependencies-2026-09-11.json) records
the desktop baseline and 24 source-free Release mobile UI flows using optional
geolocation enabled by `build.features` and a renamed non-mobile opener
dependency. Actual Swift/Kotlin permissions, retirement, events and persistence
pass; source bytes match across platforms and after success/failure. The first
Android export exposed a pinned CLI feature-forwarding omission, now corrected
without producer edits. This does not add native opener support or complete
Activity recreation and the broader lifecycle acceptance.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.

## Implementation progress — 2026-09-09

`packages/cli/test/fixtures/mobile-plugin-tauri` is an ordinary location-note application using official geolocation 2.3.3 and deep-link 2.4.10. It keeps its own Builder/setup/State, Tauri capabilities, iOS usage description and custom URL scheme, with no renderer imports or maintained host bridge. Notes are saved from actual native location results and persisted in application storage. The desktop runtime baseline passes all ten existing scenarios; [evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-desktop-2026-09-09.json) establishes desktop independence only.

The new `test:runtime:plugins:ios` and `test:runtime:plugins:android` gates require separate Tauri ACL denial, OS permission denial and later UI grant, denied location without a saved note, native position callback, background/deep-link delivery once and process-relaunch persistence. Both complete mobile gates now pass on the iOS 26.4 arm64 Simulator and Android API 37 arm64 16 KB emulator, using real Swift/Kotlin geolocation callbacks, OS permission UI and original native deep-link lifecycle. Evidence: [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-ios-2026-09-09.json), [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/tauri-mobile-fieldnotes-android-2026-09-09.json). Android reports a retryable first denial as `prompt-with-rationale`; iOS reports `denied`. The assertions preserve those upstream semantics. Fresh native scaffolds invalidate Tauri/geolocation/deep-link build-script output so regenerated permission and URL declarations cannot reuse stale results. Composed callers, pending-callback retirement and production dependency/manifest diagnostics remain open.


The format 2 Android artifact now also passes native Kotlin plugin calls through the package-owned ABI 3 session after producer deletion. A real permission request remains pending when its session is closed, settles exactly once as `session_closed`, and the later UI grant is visible to the new session without delivering the OS callback to the retired one. Location save, native remount, original deep-link Activity routing and persistence pass. [Native artifact evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-android-2026-09-09.json). The matching [iOS artifact gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-ios-2026-09-09.json) now passes the same scenarios through the real Swift geolocation implementation and original Tauri UIApplication/deep-link lifecycle. Both paths preserve original permission usage declarations and URL schemes. RN/Lynx package-level plugin/lifecycle acceptance remains open.


The Android source-free Release/R8 native event gate also passes cancellation and unlisten, the original save/deep-link notifications, listener cleanup on session replacement and exactly one new callback after remount. [Event evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-events-android-2026-09-09.json). This is native session/client evidence; RN/Expo/Lynx package-level acceptance remains open.

The matching [iOS Release native event gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-events-ios-2026-09-09.json) now also passes after producer deletion and relocation: actual Swift plugin callbacks, explicit subscription cancellation/unlisten, original save and background deep-link events, exactly one new event after remount, and one live native listener. Native client readiness, OS permission retirement, setup counts and persistence remain intact.

The packed Lynx retained SDK now passes on both platforms: original Swift/Kotlin geolocation plugins, separate Tauri/native/OS permission decisions and original save/deep-link events survive background/resume and renderer replacement. Actual native listeners drop to zero before replacement and return to one. Android uses a non-debuggable Release/R8 APK; iOS uses an arm64 Release simulator app and also removes Lynx while keeping the original Tauri frontend and `AppDelegate` working in the same process. Evidence: [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json), [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-ios-2026-09-09.json). Consumer fixtures still own attachment hooks; RN/Expo paths, automatic composition and renderer destruction during a pending OS permission callback remain open.

The packed RN Android SDK now also passes the original Kotlin geolocation permission denial/grant and location save, original Tauri events, background deep links, RN BackHandler/Linking and engine replacement/removal in one non-debuggable Release/R8 process. Native subscriptions retire before engine replacement and after removal, while the original Tauri frontend remains operational. [RN Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json). This gate forwards Activity hooks from the consumer fixture; RN iOS/Expo, Activity recreation, RN-owned permissions and actual renderer destruction during a pending OS permission callback still require execution.

Packed RN iOS now passes real Swift geolocation denial/grant, save and original Tauri events, background deep links, renderer replacement/removal and original frontend continuity. Native listeners are zero before replacement and after removal; the old RN JS thread is gone after removal. The original AppDelegate and process remain unchanged across the grant/background/replacement sequence. [RN iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-2026-09-09.json). RN owns the actual module instance and closes it before asynchronous engine invalidation. Consumer attachment remains explicit; iOS RN Linking forwarding, pending OS callback renderer retirement and broader lifecycle cases still require evidence.

Android RN startup and Activity forwarding now come from the package composer. The revised native gate retains original MainActivity/TauriActivity behavior and passes the existing real permission/plugin/event and RN replacement/removal scenarios; a second APK executes the default generated Activity without native acceptance hooks. [Android composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-android-2026-09-09.json). This removes fixture-owned lifecycle forwarding from the Android SDK proof. Activity recreation, RN-owned permissions, pending-OS-callback renderer retirement and complete cross-platform lifecycle acceptance remain open.

The RN iOS gate now obtains startup/readiness/attachment from the packed composer and SDK. Original Swift geolocation permissions, save/events, background deep links and RN replacement/removal still pass, with zero native listeners and no RN JS thread after removal while Tauri remains operational. A second Release app uses the unmodified generated startup/default layout and passes original deep-link/event checks. [iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-ios-2026-09-09.json). These nine UI flows establish package-owned attachment for the pinned native source form; iOS RN Linking, pending OS callback renderer retirement, Expo and broader lifecycle parity remain open.

Lynx Android now receives attachment and lifecycle forwarding from the packed composer/SDK. Actual Kotlin permissions, save/events, background deep links, replacement and removal pass, with native listeners zero after removal while the original frontend remains usable in the same process. A second Release APK executes default generated integration without acceptance hooks. [Composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-android-2026-09-09.json). The preceding initial baseline failure is not claimed fixed; latest-exporter startup validation, pending OS callback renderer retirement and broader lifecycle parity remain open.

A fresh current-CLI Android arm64 Release export now passes the complete native plugin/event/session-retirement gate, followed by both packed SDK automatic-composition gates using the identical artifact: [fresh Android export and SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-android-composition-2026-09-09.json). RN passes ten UI flows and Lynx nine, including actual OS denial/grant, original Tauri deep links, renderer replacement/removal and unmodified generated startup. Both SDK APK pairs are non-debuggable with eleven identical native libraries per pair; the standalone telemetry APK remains test-only debuggable. Actual renderer destruction during a pending OS permission callback is still a separate required scenario.

The packed Lynx iOS composer now owns startup observation/readiness/attachment under the unchanged Tauri AppDelegate. Nine Release UI flows pass with original Swift geolocation permissions, state/setup, events, background links, renderer replacement/removal and a second unmodified generated app: [Lynx iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-ios-2026-09-10.json). Native listeners reach zero at replacement/removal, and original frontend commands continue after Lynx is removed. Denial-to-grant explicitly resets privacy and relaunches; the subsequent grant/background/remount/removal sequence retains one process. Renderer retirement during the actual pending OS callback still requires its own native scenario.

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
