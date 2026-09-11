# Retained Tauri support and evidence

The retained path is an addon to an ordinary Tauri application. The producer
keeps its Rust, frontend, configuration, capabilities and plugin sources. Export
and renderer composition modify disposable copies. The consuming app adds the
renderer, its dependencies and generated native integration; it still starts
the original Tauri application once. Removing that consuming layer leaves the
ordinary producer runnable. CLI installation can change the producer's JS
package metadata and lockfile, as allowed by the roadmap.

This matrix describes the checked-in development implementation and its recorded
executions. It does not extend the published limited adapter's compatibility
contract. Use the [format 2 migration](migration.md#moving-to-retained-tauri-mobile)
and [artifact guide](retained-artifacts.md) with matching packed development
packages.

## Verified plugin behavior

| Plugin | iOS implementation | Android implementation | Verified actions and limits |
| --- | --- | --- | --- |
| `tauri-plugin-geolocation` 2.3.3 | Original Swift plugin in the Tauri runtime archive | Original Kotlin plugin and its copied Gradle project | Check/request location permission, actual OS denial and later grant, current position and location-note persistence. Tauri ACL denies location watch; allowed watch/channel streaming is not established. |
| `tauri-plugin-deep-link` 2.4.10 | Original Tauri application URL lifecycle | Original Tauri Activity and Kotlin plugin | Configured custom scheme, current URL, background/resume delivery and an original Rust event. Associated-domain Universal Links and Android verified App Links remain separate acceptance. |
| Fixture's Rust `runtime-probe` plugin | Original Tauri Builder registration | Original Tauri Builder registration | Setup once, an allowed command and capability denial before its side effect. This is application-owned Rust plugin evidence, not arbitrary external native plugin support. |

[Bare RN and actual CNG recreation](evidence/retained-bare-rn-cng-recreation-2026-09-11.json)
add 21 Android Release/R8 UI flows. Bare RN performs two recreations with its
location request pending; replacement camera requests after real AppState active
receive only their own OS denial/grant. The APK contains no Expo native core.
Normal Expo CNG performs two recreations with actual prebuild/config-plugin
metadata, module lifecycle and file persistence. Both retain Tauri State/setup
45/1/1, forward back/deep links and finish renderer destruction while original
Tauri IPC remains usable. Input source/artifact/package bytes stay unchanged.
Additional CNG permission modes are wired and being executed; this evidence
does not claim those modes or complete hosted/device/adopter acceptance.

The original local WebView's Tauri authority remains in force. A direct native
session additionally needs an exact grant in `callers.json`; delegation does not
grant the corresponding Tauri permission or the OS location permission. Denial
at each layer is exercised separately. No wildcard is added for composition.

## Recorded mobile executions

Every row uses the same ordinary location-note producer and original frontend.
Each baseline reports State value 45 and application/plugin setup counts of one.
The standalone rows use the ordinary Tauri CLI. Composed rows use packed SDKs,
source-free artifacts and package-owned startup, including a second app with
unmodified generated startup and no native acceptance subclass.

| Application | Native execution | Plugin/permission evidence |
| --- | --- | --- |
| Standalone Tauri iOS | arm64 Simulator, Debug | [Original Swift permission UI, position, deep link and relaunch persistence](evidence/tauri-mobile-fieldnotes-ios-2026-09-09.json) |
| Standalone Tauri Android | arm64 16 KB emulator, Debug | [Original Kotlin permission UI, position, deep link and relaunch persistence](evidence/tauri-mobile-fieldnotes-android-2026-09-09.json) |
| RN iOS | arm64 Simulator, Release; 25 UI flows | [Original plugins, view identity, pending permission retirement, Linking and teardown](evidence/retained-rn-view-2026-09-11.json) |
| RN Android | arm64 16 KB emulator, Release/R8; 18 UI flows | [Original plugins, view identity, pending permission retirement, BackHandler and teardown](evidence/retained-rn-view-2026-09-11.json) |
| Lynx iOS | arm64 Simulator, Release; 17 UI flows | [Original plugins, view identity, pending permission retirement and teardown](evidence/retained-lynx-view-2026-09-11.json) |
| Lynx Android | arm64 16 KB emulator, Release/R8; 17 UI flows | [Original plugins, view identity, pending permission retirement and teardown](evidence/retained-lynx-view-2026-09-11.json) |
| Expo iOS / Android | arm64 Release; 34 / 32 UI flows | [Actual Expo prebuild/config plugins and native modules under retained Tauri ownership](evidence/retained-expo-cng-2026-09-11.json) |

The [standalone macOS baseline](evidence/tauri-mobile-fieldnotes-desktop-2026-09-09.json)
records ten original runtime scenarios; it makes no mobile permission claim.
The [audit](evidence/retained-support-audit-2026-09-11.json) compares recorded
baseline, permission, teardown and authored-source results. It is a review of
these executions, not another native run or a completed release parity gate.

For all four RN/Lynx rows, retiring the renderer during an actual OS permission
dialog leaves Tauri ready, removes its native listeners and prevents the old
continuation from saving a sentinel note. The new renderer observes the grant
and saves a location note. iOS denial-to-grant resets privacy and relaunches;
the subsequent retirement/grant/background/removal sequence preserves one
process. The evidence does not count callbacks into an already destroyed JS
runtime. See the [permission-retirement record](evidence/retained-sdk-permission-retirement-2026-09-11.json).

The [Android recreation comparison](evidence/retained-activity-recreation-2026-09-11.json)
adds two actual `Activity.recreate()` transitions each in standalone Tauri and
packed RN/Lynx apps, after location permission has been granted. Fifteen native
UI flows verify new Activity/WebView objects with the same process, Wry window
ID, State 45 and setup/plugin counts of one. Original notes survive; location
save and deep links still work. Each composed renderer's old native listeners
reach zero before its new listener and events are established. This uses the
existing retained artifact and introduces no production bootstrap change.

The fixture's initial ten-scenario self-test assumes State 40 for a fresh JS
document. On recreation its state remains 45, so the gate explicitly records
that self-test's initial-state assertion failure and checks the preserved runtime
through original IPC. Separate standalone attempts did not observe the expected
initial permission-grant response and, in another run, the post-recreation
deep-link UI update. The record preserves both unresolved failures; later
passing runs do not establish their cause or a fix.

The [fresh permission gate](evidence/retained-recreation-permissions-2026-09-11.json) reproduces
an upstream Android boundary: Tauri 2.11.5 keeps the first Activity's result
launchers after that Activity is destroyed. The exported dependency now registers
them for each new Activity in the original order, as required by the
[Android Activity Result contract](https://developer.android.com/training/basics/intents/result).
The producer and original standalone dependency stay unchanged; plugin instances,
callback storage and Tauri initialization are retained.

A new source-free arm64 Release export passes twelve native UI flows. Packed
RN and Lynx each pass seven further flows: a first permission request after
recreation, OS denial, another recreation retaining `prompt-with-rationale`,
then OS grant, location save and deep link. State/setup stay 45/1/1 and retired
listeners reach zero. Both composed APKs are non-debuggable Release/R8; the
native-only export gate uses test debuggability. These executions preserve all
fourteen producer files. They do not resolve the separately recorded standalone
initial permission-response or post-recreation link UI failures.

The [pending permission comparison](evidence/retained-pending-recreation-2026-09-11.json) adds
eighteen packed RN/Lynx Android UI flows. A test-only broadcast triggers real
Activity recreation while the OS dialog remains visible. Denial and grant each
complete the original Tauri callback once on the replacement Activity, observed
by logging after that unchanged callback returns. Old native listeners reach
zero, no retired renderer saves its sentinel note, and the new renderer saves a
location note and receives a deep link. These runs reuse the corrected artifact.
The previous RN artifact fails the same callback-completion check after OS denial;
that control is preserved as a failure. This does not count callbacks inside a
destroyed JS runtime or establish RN-owned permission and Expo recreation support.

The [Expo recreation evidence](evidence/retained-expo-recreation-2026-09-11.json)
adds 33 transferred-SDK Android Release/R8 UI flows across normal, fresh Tauri
permission and pending Tauri permission scenarios. Each performs two real
Activity recreations. Original State/setup remain 45/1/1, and denial/grant during
recreation each complete the original Tauri callback once. Actual Expo modules
are created once per Activity and destroyed on retirement; the application
initializes once. Expo file bytes, back handling and deep links survive. Final
renderer removal leaves zero native listeners and all three Expo module instances
destroyed while original Tauri IPC still reads the same state and notes.

All fourteen producer files and transferred artifact/SDK bytes are unchanged.
This reuses the earlier arm64 Release export and fresh external dependencies;
there is no production runtime change or fresh Rust export. The first attempt
failed because the new test layout omitted its Close RN button. That failed
attempt is preserved; adding the test-only control and rerunning the complete
scenario produced the passing result. These gates use package-owned Expo
composition; renderer-owned permissions are covered by the later gate below.
Physical devices and hosted Linux/x86_64 execution are not inferred.

The [renderer-owned permission evidence](evidence/retained-renderer-permission-recreation-2026-09-11.json)
adds 30 Android Release/R8 UI flows: 15 using actual RN PermissionsAndroid and 15
using Expo's permission API, both in package-owned Expo composition. Each
recreates twice with an OS location dialog pending. The retired listener receives
no result and saves no sentinel. After real resume, the replacement renderer
requests camera and receives only its own denial/grant. Original Tauri IPC keeps
State/setup 45/1/1; Expo modules, file persistence, back/deep-link forwarding and
final removal pass. All producer and input artifact/tarball bytes stay unchanged;
only the copied SDK receives observation logs. No production fix is claimed.

The failed System UI ANR and two incorrect test assumptions remain recorded.
Mount effects run after resume, and renderer-owned denial leaves Tauri's own
rationale cache untouched (`prompt`); the gate preserves those behaviors while
checking exact OS results. This does not certify bare-RN permission recreation
or Expo CNG recreation. Android CI now requires both owner modes and rejects
missing, duplicate or misrouted callbacks and incomplete Expo cleanup.

## Native ownership and dependencies

| Layer | Required contract |
| --- | --- |
| Exported Tauri runtime | Tauri 2.11.5, CLI 2.11.4, tauri-runtime-wry 2.11.4, Wry 0.55.1; format 2 / ABI 3; immutable complete receipt. |
| iOS | Original Tauri bootstrap/AppDelegate, Xcode project, usage descriptions, schemes, resources and runtime archive. Build a generated copy with Xcode/CocoaPods. Device distribution still needs ordinary signing. |
| Android | Original Tauri/Wry Activity chain, native plugin projects, Manifest declarations and JNI libraries. Build a generated copy with Android SDK/JDK/Gradle; packaged ELF and APK alignment checks remain required. |
| RN | RN/codegen 0.86.3 and Hermes 250829098.0.17. Consumer iOS minimum is at least 16.4; the producer's minimum stays unchanged. See the [RN integration guide](../packages/react-native/RETAINED.md). |
| Lynx | Lynx 4.0.1 / PrimJS 4.0.0 and the original Tauri native client. Consumer iOS minimum is at least 14.0 and preserves higher authored targets. See the [Lynx integration guide](../packages/lynx/RETAINED.md). |
| Expo | Expo 57.0.19, CLI 57.0.21, config/config-plugins 57.0.9 and prebuild-config 57.0.15, plus the RN requirements. Use `tauri-native-prebuild` with the retained plugin first. |

The native gates are serial: their application identity and Maestro driver are
shared. Reproduction commands and tool versions are in each evidence file and
the [runtime test guide](../packages/cli/test/runtime/README.md). Compilation of
other slices does not establish execution on those architectures or devices.

## Diagnosed boundaries and remaining acceptance

Export resolves the selected target's Cargo dependency graph with default
features, `build.features` and Tauri's `custom-protocol` feature. It follows
aliases and transitive normal/build dependencies from the producer, excluding
dev-only and unrelated workspace dependencies. An inactive desktop dependency
can remain in the producer and its lockfile. An active unverified plugin fails
with its exact name, version and target; slices with different native plugin
sets must be exported separately. Dependency source fingerprints also retain
host build inputs.

The [dependency-selection gate](evidence/retained-target-dependencies-2026-09-11.json)
executes a desktop baseline and 24 source-free Release mobile UI flows with
optional geolocation enabled by `build.features` and a renamed opener dependency
restricted to non-mobile targets. Both mobile exports preserve producer bytes,
cache hits and failure recovery. This verifies dependency selection, not mobile
opener support. The pinned Android CLI needs configured features forwarded
explicitly; that correction follows a preserved failed native export. The iOS
execution used identical shared/iOS code before this Android-only correction.

Unsupported native dependency declarations, changed original registrations,
conflicting startup owners and edited generated files are rejected. Adding a
new native plugin requires exporter/dependency support and actual mobile
execution; editing the allowlist alone is insufficient.

Bare-RN permission recreation, Expo CNG recreation, full
navigation/history/rotation behavior, native channel
streaming and broader source/owner forms remain open. Expo config plugins are
supported within the [documented native configuration/resource boundary](../packages/react-native/RETAINED.md#expo-config-plugins-and-native-regeneration).
Required retained CI, transferred-package parity, physical devices and two
independent adopters remain release work in [plan 023](../plans/023-tauri-mobile-composition-acceptance.md).


## Transferred SDK acceptance — 2026-09-11

[Local native evidence](evidence/retained-ci-transfer-android-2026-09-11.json)
adds 24 RN and 17 Lynx Android UI flows using received SDK tarballs and fresh
renderer dependencies installed outside the checkout. Both Release/R8 apps run
the acceptance UI and unmodified generated startup. The harness verifies the
producer-provided SDK digest before extraction, records transferred package
identity, and rejects missing CI input instead of repacking locally. Android
checks the emulator ABI against the artifact and requires 16 KB pages.

The original fourteen-file Tauri producer, copied artifacts and extracted SDK
files remain unchanged. The existing producer-deleted artifact is reused; this
is not a fresh export or a same-commit GitHub Actions result. Initial RN Metro
path-alias and Lynx missing-TypeScript failures occurred before native build
and remain separate from acceptance. Their corrected external dependency runs
pass. Three transfer-input scenarios and CLI/script typechecks also pass.

The [required retained workflow](validation.md) now includes the ordinary apps,
retained native clients, RN, Expo CNG, Lynx and Android recreation modes. Its
producer and both native jobs must match the same inputs before aggregation.
The workflow is wired; a complete hosted run, remaining iOS/Expo CNG transfer runs,
Linux/x86_64 execution, broader lifecycle/channel parity, devices and independent
adopters remain open. Receipt tests do not certify pending native execution.
See [local workflow evidence](evidence/retained-ci-workflow-android-2026-09-11.json)
for the fresh Android preparation and receiving-device checks.


## iOS transfer acceptance and first hosted run — 2026-09-11

[New iOS evidence](evidence/retained-ci-workflow-ios-2026-09-11.json) records a
fresh ordinary Tauri app and retained Release export, producer deletion and
20 receiving-device UI flows (8 ordinary, 12 native retained). Both execute
without Rust or producer source. All original source and received artifact
bytes remain unchanged. This covers native Tauri permissions, callback
retirement, events, deep links and persistence on an owned iOS 26.4.1 simulator.

The [first hosted retained workflow](https://github.com/gronxb/tauri-native/actions/runs/34555941668)
failed in the CLI typecheck before native execution: the independent mobile
fixture's two plugin dependencies had not been installed. The producer now
installs that fixture's locked dependencies before its existing checks. The corrected
[hosted producer at `002ee3a`](evidence/retained-hosted-producer-2026-09-11.json)
passes the locked installation, existing checks and exports. Its downloaded
archive and all three package hashes/embedded identities are verified; the
SDK bytes match the local transferred inputs. Retained producer and receiving
platform jobs still need separate success; the full hosted run remains required.
The earlier ABI 2 candidate does not certify these new retained jobs. Physical
devices and independent evaluations remain pending, as confirmed by the maintainer.

The [completed existing Android receiving job](evidence/retained-hosted-legacy-android-2026-09-11.json)
also passes at `002ee3a`. Its downloaded receipt matches the verified producer,
commit and package hashes. Thirteen successful UI flows cover original/changed
Fieldnotes in RN/Expo/Lynx and RN/Lynx async/view behavior; the standalone ABI 2
native result matches its transferred APK on hosted Linux/API 36 x86_64/16 KB.
This is existing-path regression evidence. Retained ABI 3 jobs, the later Expo
recreation gates and the complete candidate still require their own success.

The [retained producer has also completed](evidence/retained-hosted-producer-complete-2026-09-11.json)
at `002ee3a`. Its downloaded ABI 3 archive contains 39 iOS export files and 100
Android export files, plus the separately prepared ordinary apps. Every listed
file size/hash and both standalone binary hashes match their receipts. The
producer checks desktop execution, unchanged fourteen-file source, cache reuse,
rejected invalid capabilities, preserved previous output and producer deletion.
The [receiving jobs have now failed](evidence/retained-hosted-receiving-failures-2026-09-11.json).
Both ordinary apps pass six UI flows through permission denial/grant, location
save and backgrounding, then fail the `Links received 1` assertion. Their later
retained consumers do not run. The existing iOS changed-Rust RN flow also fails
its first library assertion after stop/relaunch; its original RN/Expo/Lynx and
changed Lynx/Expo flows pass. Native delivery versus UI observation, and the RN
startup failure, still need diagnosis. No full candidate is certified by this run.
