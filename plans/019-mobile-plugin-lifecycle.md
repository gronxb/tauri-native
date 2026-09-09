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


The Android source-free Release/R8 native event gate also passes cancellation and unlisten, the original save/deep-link notifications, listener cleanup on session replacement and exactly one new callback after remount. [Event evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-events-android-2026-09-09.json). This is native session/client evidence; RN/Expo/Lynx package-level acceptance remains open.

The matching [iOS Release native event gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-events-ios-2026-09-09.json) now also passes after producer deletion and relocation: actual Swift plugin callbacks, explicit subscription cancellation/unlisten, original save and background deep-link events, exactly one new event after remount, and one live native listener. Native client readiness, OS permission retirement, setup counts and persistence remain intact.

The packed Lynx retained SDK now passes on both platforms: original Swift/Kotlin geolocation plugins, separate Tauri/native/OS permission decisions and original save/deep-link events survive background/resume and renderer replacement. Actual native listeners drop to zero before replacement and return to one. Android uses a non-debuggable Release/R8 APK; iOS uses an arm64 Release simulator app and also removes Lynx while keeping the original Tauri frontend and `AppDelegate` working in the same process. Evidence: [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json), [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-ios-2026-09-09.json). Consumer fixtures still own attachment hooks; RN/Expo paths, automatic composition and renderer destruction during a pending OS permission callback remain open.

The packed RN Android SDK now also passes the original Kotlin geolocation permission denial/grant and location save, original Tauri events, background deep links, RN BackHandler/Linking and engine replacement/removal in one non-debuggable Release/R8 process. Native subscriptions retire before engine replacement and after removal, while the original Tauri frontend remains operational. [RN Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json). This gate forwards Activity hooks from the consumer fixture; RN iOS/Expo, Activity recreation, RN-owned permissions and actual renderer destruction during a pending OS permission callback still require execution.

Packed RN iOS now passes real Swift geolocation denial/grant, save and original Tauri events, background deep links, renderer replacement/removal and original frontend continuity. Native listeners are zero before replacement and after removal; the old RN JS thread is gone after removal. The original AppDelegate and process remain unchanged across the grant/background/replacement sequence. [RN iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-2026-09-09.json). RN owns the actual module instance and closes it before asynchronous engine invalidation. Consumer attachment remains explicit; iOS RN Linking forwarding, pending OS callback renderer retirement and broader lifecycle cases still require evidence.

Android RN startup and Activity forwarding now come from the package composer. The revised native gate retains original MainActivity/TauriActivity behavior and passes the existing real permission/plugin/event and RN replacement/removal scenarios; a second APK executes the default generated Activity without native acceptance hooks. [Android composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-android-2026-09-09.json). This removes fixture-owned lifecycle forwarding from the Android SDK proof. Activity recreation, RN-owned permissions, pending-OS-callback renderer retirement and complete cross-platform lifecycle acceptance remain open.

The RN iOS gate now obtains startup/readiness/attachment from the packed composer and SDK. Original Swift geolocation permissions, save/events, background deep links and RN replacement/removal still pass, with zero native listeners and no RN JS thread after removal while Tauri remains operational. A second Release app uses the unmodified generated startup/default layout and passes original deep-link/event checks. [iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-ios-2026-09-09.json). These nine UI flows establish package-owned attachment for the pinned native source form; iOS RN Linking, pending OS callback renderer retirement, Expo and broader lifecycle parity remain open.

Lynx Android now receives attachment and lifecycle forwarding from the packed composer/SDK. Actual Kotlin permissions, save/events, background deep links, replacement and removal pass, with native listeners zero after removal while the original frontend remains usable in the same process. A second Release APK executes default generated integration without acceptance hooks. [Composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-android-2026-09-09.json). The preceding initial baseline failure is not claimed fixed; latest-exporter startup validation, pending OS callback renderer retirement and broader lifecycle parity remain open.
