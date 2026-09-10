# Retained Tauri integration

This development path consumes an ordinary Tauri project exported with
`--runtime retained`. The original Tauri application, WebView, Rust managed
state, commands, capabilities and native plugins remain alive. The producer
does not import React Native or maintain a command bridge.
Authored Rust, frontend, Cargo/configuration, capabilities and plugin files stay
unchanged. Integration belongs to the generated copy and consuming app; removing
that layer leaves the original Tauri project independently runnable.

## JavaScript

Open a session after attaching the RN surface to the ready original Tauri app.
The caller must exist in the export's `callers.json`. Every command and event
batch must satisfy both native caller delegation and the original Tauri ACL.

```ts
import { openTauriSession } from '@tauri-native/react-native/retained';

const session = await openTauriSession('native');
const unlisten = await session.listen('fieldnotes-updated', event => {
  console.log(event.payload);
}, error => {
  // Refetch state after event_overflow or invalid_event_payload.
  console.error(error);
});
const result = await session.invoke('list_notes', {});
await unlisten();
await session.close();
```

The RN and Lynx packages ship the same session client without depending on each
other. Commands retain `{ ok: true, value }` or `{ ok: false, error }`, including
structured producer errors and runtime denial codes. Transport/local close
failures reject the promise. Invoke supports `cancel()` and an optional third
`{ signal }` argument; cancellation retires delivery, while already executing
Rust side effects may finish.

Subscriptions persist while idle. Clean up sessions in the component's effect
cleanup. Engine replacement/destruction also retires all native requests and
listeners before RN destroys its ReactContext and JSI runtime. Overflow is
reported explicitly; authorization or transport failure closes the event stream.

## Original Tauri view

```tsx
import { TauriView } from '@tauri-native/react-native/retained';

<TauriView
  style={{ flex: 1 }}
  onAttach={() => console.log('Original document attached')}
  onAttachError={error => console.error(error.code, error.message)}
/>
```

The component borrows the original Tauri WebView from the generated composition.
It does not create a WebView, load a URL or change its navigation/native plugin
handlers. Original frontend IPC and direct session calls use the same Tauri app
and managed state. `onAttach` acknowledges native attachment, not a later page
load. Give the component a nonzero layout size; it has no intrinsic height.

The current contract is one original WebView and one retained RN host. One
component may display that document at a time. A competing component reports
`view_in_use`; a missing or retired owner reports `view_unavailable`. Unmount a
failed component before retrying. No URL/path, navigation or children props are
provided. Unmounting restores the original native parent/layout. Reloading or
closing RN restores the original view before its engine and component tree are
destroyed. The Tauri document and its JavaScript state remain alive.

The generated iOS and Android integrations pass the original WebView to the
host automatically. For manual integration, use the `TNReactHost` initializer
with `webView` and `launchOptions`, or pass the original WebView as the fifth
`TauriReactHost` constructor argument. Existing initializers remain valid for
native sessions; a host without a WebView cannot attach `TauriView`. Component
ownership follows the mounted Fabric surface/ReactContext generation. The
retained component specs and registration stay separate from the existing
format 1 component exported by the package's default entry.

## Android integration under development

This path pins RN/codegen 0.86.3, Hermes 250829098.0.17, Kotlin 2.1.20, NDK
27.1.12297006 and CMake 3.22.1. It uses RN's generated TurboModule and Fabric,
with a separate `ReactHost` owned by the package. It does not use RN's global
default host cache or replace the Tauri Activity/Application.

The package exposes a source-free reader and Android composer:

```js
const { readRetainedArtifacts } = require('@tauri-native/react-native/retained-artifacts');
const { composeAndroid } = require('@tauri-native/react-native/compose');

readRetainedArtifacts('./runtime/android');
const result = composeAndroid({
  artifactsDir: './runtime/android',
  outputDir: './generated-android',
  rendererDir: '.',
  moduleName: 'YourApp',
  bundleFile: './index.android.bundle',
});
console.log(result.project, result.activity);
```

Build the offline Metro bundle first with the consumer's normal RN toolchain.
Create the output's parent directory before calling the composer. The complete
artifact, installed SDK and bundle must stay outside the generated output; the
output may be a child of the renderer project. Build the returned Android
project with Gradle. Release signing stays under the consumer's control.

The composer validates every input file and the pinned RN/codegen versions
before generating a copy. It preserves the original Tauri/native plugin projects,
permissions, schemes, assets and libraries. The original `MainActivity` keeps
its upstream `enableEdgeToEdge` and superclass startup; the generated
`TauriNativeActivity` subclasses it. Only the copied original class is opened
for inheritance. Its generated launcher owns RN initialization, waits for the
real runtime and original document, attaches a Fabric surface, forwards Activity
lifecycle/results/intents and closes RN at Activity destruction. The original
Tauri/Wry Activity and application bootstrap remain in the inheritance chain.

The default RN surface fills a container above the retained original WebView.
A consumer subclass may override `createReactContainer(webView)` to choose a
native layout and use the protected `tauriReactHost` for reload/removal. The
`onReactHostAttached()` hook runs after attachment. Keep all original superclass
calls. Use `TauriView` to display the original document inside the RN component tree.

The generated Gradle integration compiles `RuntimeSession.java` once in a shared
library, links the installed SDK, resolves RN/codegen through Node (including
pnpm layouts), selects exported ABIs and keeps R8/Release lint. AGP 8.11.0 uses
its K1 lint analyzer because its K2 analyzer crashes on applied Kotlin scripts
([upstream issue](https://issuetracker.google.com/issues/430991549)). The producer
and input receipt remain byte-identical and no Rust build is invoked.

Generation stages a complete replacement of an owned output directory.
Validation failures leave the old output intact; a failed rename restores it. If
rollback also fails, the error identifies the preserved backup instead of deleting
it. An identical invocation leaves generated files and build cache untouched. Upgrades
preserve unrelated consumer files; edits to generated files, new file conflicts,
symlink collisions, custom Activity/Application owners, competing renderer
configuration and unverified toolchain versions receive explicit diagnostics.
The current automatic path accepts the pinned standard Tauri `MainActivity`;
custom lifecycle owners require separate integration evidence. Expo CNG remains
open; the optional Android Expo composition below links installed native modules.

`TauriReactHost` remains available for explicit native attachment. Its lifecycle
methods must receive the original Activity callbacks; the generated Activity
supplies these calls automatically. Its lifecycle-bound AndroidX back callback
sends events to RN `BackHandler` and delegates unhandled events to the original
dispatcher. RN `Linking` receives the same forwarded Intent as Tauri's own path.

The generated Activity implements RN's `PermissionAwareActivity`, so
`PermissionsAndroid.request` and `requestMultiple` use the real OS permission
dialog. RN requests have their own AndroidX Activity Result registration; the
original Tauri plugin registrations and callbacks remain in place. Requests are
queued and results reach their original RN listener after the Activity resumes.
Reloading or closing RN drops that generation's queued requests and listeners.
An already visible OS dialog can still change the app's permission grant, but
its result cannot call the retired listener or a new engine's reused RN request
code. The SDK adds no permission declarations to the producer.

For manual attachment, create one `TauriReactPermissions(activity)` during
Activity creation, before STARTED, and pass it as the host's sixth constructor
argument. Implement `PermissionAwareActivity` and forward its three-argument
`requestPermissions` overload to the host, as the generated Activity does. This
overload accepts RN module-queue calls; lifecycle methods still run on main.
Keep the router for that Activity when replacing a host. The Activity lifecycle
unregisters its result callback at destruction. Activity recreation remains open;
scoped Expo native module integration is described below.

OS grants are shared: a grant requested by RN is visible to the Tauri plugin.
Denial labels retain upstream behavior. Tauri 2.11.5 reads its own
`PluginPermStates` cache for denied permissions, so an RN-only denial can remain
`prompt` in Tauri while RN returns `denied`. Composition does not rewrite that
cache or turn a denial into a grant.

`reload()` replaces the RN engine and re-renders its surface while retaining
Tauri. `close()` retires native sessions immediately, removes the RN view/back
callback and asynchronously destroys RN; `destroyed` becomes true when cleanup
finishes. Call `close()` during Activity destruction as well. Host lifecycle methods
run on main. Permission dialogs/backgrounding keep native sessions alive.

The native gate is
`node --experimental-strip-types packages/react-native/test/retained-android.ts <artifact>`
with `ANDROID_SERIAL`, Android SDK/JDK and Maestro configured. It packs the real
SDK, bundles its compiled public entry, and builds a relocated non-debuggable
Release/R8 consumer without Rust on PATH. The acceptance subclass owns only layout, baseline readiness and telemetry;
the packed composer owns the Activity and its startup/lifecycle integration. A
second Release APK executes the unmodified generated Activity and default layout
without acceptance hooks. The SDK owns the generated module, RN engine, surface,
back routing and native session lifetime.

### Android Expo native modules

Pass `expo: true` to `composeAndroid` to link the renderer's installed Expo and RN
native dependencies. Use `moduleName: 'main'` with Expo's `registerRootComponent`,
and build the offline bundle with the consumer's Expo/Metro configuration. This
option has a corresponding iOS integration described below.

The current path pins Expo 57.0.19, Expo Modules Core 57.0.15, autolinking 57.0.12
and the RN/codegen versions above. Put `outputDir` inside `rendererDir` so Expo's
Gradle scripts can resolve the consuming app, and keep Node on the build PATH.
Rust and the original producer checkout are not required. An explicit Expo
`android.package` must match the original Tauri application ID. The composer
adds no permission declarations to the producer; native library manifests are
merged into the generated consumer by Gradle.

Expo autolinking discovers packages from the renderer's dependencies and local
modules. The SDK's format 1 native package is excluded; its retained package and
codegen remain separate. A single generated `appmodules` entry point registers
retained, RN core and autolinked TurboModules/Fabric components. The generated
consumer uses AGP 8.12.0 with Java/Kotlin 17 for its RN app. Original Tauri native
projects keep their own matching Java/Kotlin targets through RN 0.86's project
alignment opt-out; their build files and the immutable artifact are unchanged.

The generated Application forwards Expo application lifecycle notifications;
the generated Tauri Activity forwards Expo Activity and supported key/back
callbacks alongside its existing Tauri and RN paths. Expo host handlers receive
bundle selection, host/context creation and exception callbacks. Native Expo
modules belong to the current RN context and are destroyed with that context;
the original Tauri runtime stays alive. No global Expo ReactHost cache is used.

Modules which replace a `ReactActivity` delegate, require its delayed loading
hook, or request a development host receive explicit diagnostics. These loading
owners need separate retained integration. This option does not yet implement
`expo prebuild --clean`, config-plugin native edits or
general Activity recreation. It is the native module/autolinking stage of that
roadmap, not a completed CNG path.

The Android native gate accepts a final `--expo` argument after the artifact
path. It exercises the same retained app scenarios plus an actual Expo native
file module, an autolinked SafeAreaProvider, and a local Expo module that records
native lifecycle and permission delivery. The local module supplies evidence;
all package discovery and lifecycle forwarding come from generated integration.

## iOS integration under development

This path pins RN/codegen 0.86.3 and its matching prebuilt React,
ReactNativeDependencies and Hermes frameworks. The composed consumer requires
iOS 16.4 or later. The ordinary producer and immutable exported artifact keep
their original deployment settings. The generated consumer uses the highest of
16.4, the export's minimum and all explicit original Xcode deployment targets.

On macOS, with Xcode's `plutil` available, generate the native consumer after
building the offline Metro bundle:

```js
const { composeIos } = require('@tauri-native/react-native/compose');

const result = composeIos({
  artifactsDir: './runtime/ios',
  outputDir: './generated-ios',
  rendererDir: '.',
  moduleName: 'YourApp',
  bundleFile: './index.ios.bundle',
});
console.log(result.project, result.workspace, result.target, result.minimumOsVersion);
```

Use the same directory ownership rules as Android above. Run `pod install` in
`result.project`, then build `result.workspace` with the original Tauri target.
The generated Podfile uses the installed RN/SDK dependencies and records the
absolute Node executable in the usual Xcode environment files. Rust and the
producer checkout are not required.

The composer preserves the original Xcode target, permission descriptions,
schemes, native plugins, archive and the single compiled native session client.
It adds SDK notification registration before the unchanged `ffi::start_app()`.
`TNReactComposition` waits for the original runtime and loaded WKWebView, then
attaches RN above that WebView within its parent's safe area. The original
application delegate, window and root controller remain responsible for Tauri.
The current path requires one original application target, standard Tauri main,
one original WebView, and no existing CocoaPods or scene/delegate owner.
Unsupported configuration receives an explicit diagnostic before publication.

The generated-file receipt checks every owned file before CocoaPods runs.
After successful integration, the SDK records only CocoaPods' project rewrite;
other modified files or a changed receipt fail validation. Before pod installation,
an identical composition is a no-op. After installation, composing again restores
the original project plus SDK configuration, so run `pod install` again before
building. Unrelated files and Pods caches remain; edits to owned generated files
must be resolved before regeneration. Both installation/regeneration cycles are
covered by the native gate.

`TNReactComposition` exposes main-thread `reload`, `close` and its current `host`.
A native subclass may override `isTauriDocumentReady:`, `createReactContainer:`
and `reactHostDidAttach` when the consumer needs a custom readiness check or
layout. Install that subclass in the consumer's native entry point. Such edits
are consumer-owned custom integration and must be resolved before regenerating
the owned main file. The public `TauriView` component uses the host's original WebView.

For explicit native integration, the lower-level Podfile helpers and `TNReactHost`
remain available:

Keep the original format 2 Xcode project, `ffi::start_app()`, Tauri application
delegate, runtime archive, permission descriptions and URL schemes. Its app
target already compiles `TNRuntimeSession.mm`; do not compile another copy.

In the consumer Podfile, set `RCT_USE_RN_DEP` and `RCT_USE_PREBUILT_RNCORE` to `1`,
load RN's `react_native_pods.rb` and the installed SDK's `ios/retained/pods.rb`,
then call `TauriNativeReactRetained.prepare(rn_path, absolute_node_path)` before
declaring pods. The helper validates versions and runs standard RN codegen for
the isolated SDK specs. Generated sources stay in the installed SDK's
`ios/retained/generated` directory and are excluded from npm packing.

Use `use_react_native!` for the consumer app and add
`pod 'TauriNativeReactRetained', :path => '<installed-sdk>/ios'`. After
`react_native_post_install`, call
`TauriNativeReactRetained.post_install(installer, original_tauri_target_name)`.
The helper replaces CocoaPods' global `-ObjC` with explicit loading of the three
RN static libraries. RN's prebuilt frameworks load dynamically; the Tauri
archive is unchanged. Other frameworks/static pods or non-prebuilt RN receive
an explicit compatibility diagnostic. Keep the normal RN Node environment for
its Xcode build scripts; Rust and the producer checkout are not needed.

Attach after the original Tauri document is ready, on main:

```objc
#import <TauriNativeReactRetained/TNReactHost.h>

host = [[TNReactHost alloc] initWithContainer:container
                                     module:@"YourApp"
                                     bundle:bundleURL];
```

`reload` closes native sessions and replaces the Factory, Fabric surface and RN
host. `close` closes sessions before releasing RN's surface and host, allowing
RN's own asynchronous instance invalidation to finish. Neither operation
replaces Tauri's root view controller or application delegate. RN's AppState
module observes ordinary UIApplication notifications. Automatic composition
forwards incoming URLs: it calls the original Tauri handler
first, keeps its return value, then delivers the URL to the current RN engine.
Closing composition restores its own URL/activity wrappers while preserving any
later wrapper installed by another integration. The original delegate object stays
in place. Custom scene/delegate owners still require separate integration.

For explicit native integration, use the initializer's `launchOptions:` overload
with the original UIKit launch options and forward incoming URLs through
`handleOpenURL:` after the original Tauri handler. Automatic composition already
performs that forwarding. UIKit launch URLs reach `Linking.getInitialURL()` across
RN reload. Later URLs, including those received while renderer attachment is
pending, arrive as `Linking` URL events. The SDK retains events until that engine's
first URL listener, then follows ordinary listener registration/removal; retiring
the engine discards its pending delivery.

The native gate is
`node --experimental-strip-types packages/react-native/test/retained-ios.ts <artifact>`
with `IOS_SIMULATOR_UDID`, Xcode, CocoaPods and Maestro configured. It packs the
actual SDK, composes a relocated artifact, installs pods, regenerates, installs
pods again and builds Release without Rust on PATH. An acceptance subclass adds
layout, controlled readiness, native activity injection and telemetry; the SDK owns startup observation,
attachment and lifetime. A second Release app runs the unmodified generated
startup/default layout without that subclass. Eighteen UI flows cover permissions,
plugins/events, replacement/removal, URL-driven startup, delayed attachment and
default integration. [Native execution evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-linking-2026-09-11.json)
records the previous missing RN delivery and the corrected packed SDK. Custom
scheme URLs use the OS. The browsing/unrelated activity checks inject native
delegate callbacks; OS associated-domain/Universal Link acceptance remains open.
Run the separate
macOS metadata/ownership scenarios with
`node --experimental-strip-types --test packages/react-native/test/retained/compose-ios.test.ts`.

### iOS Expo native modules

Pass `expo: true` to `composeIos`, use `moduleName: 'main'` with Expo's
`registerRootComponent`, and place `outputDir` inside `rendererDir`. The installed
renderer dependencies must include Expo 57.0.19, Expo Modules Core 57.0.15,
autolinking 57.0.12 and Constants 57.0.17, alongside the pinned RN versions above.
An explicit Expo `ios.bundleIdentifier` must match the original Tauri app ID.
Keep Node on the Xcode build PATH for Expo's build scripts. Rust and the producer
checkout are not required.

The generated Podfile uses Expo autolinking for installed RN and Expo native
modules, including local Expo modules. It excludes the SDK's format 1 native
package and codegen. Expo's actual `ExpoReactNativeFactory` creates the renderer;
its delegate forwards retained session, Linking and Fabric registration to the
same SDK delegate used by plain RN. Expo modules are destroyed with their RN
context, while Tauri setup, state, plugins and the original WebView stay alive.

Generated startup installs Expo application callback routing before the unchanged
`ffi::start_app()`. The original Tauri `UIApplication.delegate` object remains in
place. Known overlapping callbacks call Tauri first, then Expo's application
subscriber dispatcher; URL/activity handling accepts either handler's result.
Expo-only optional application callbacks forward their arguments and completion
handlers through the original delegate. Unverified overlapping callbacks receive
an explicit diagnostic. Application subscribers live for the application,
independently of RN replacement or removal. The plain RN URL wrapper continues to
retire with its composition.

The CocoaPods helper loads CocoaPods-owned static products explicitly instead of
force-loading the original Tauri archive with global `-ObjC`. It preserves Tauri
archive bytes and native plugin integration. It also invokes the pinned Expo
Constants config generator with the consuming renderer root, including paths
with spaces; only the generated CocoaPods script phase changes.
Expo 57.0.19's factory and React delegate retain each other. For renderer teardown,
the helper compiles a checked copy of that factory with a weak forwarding
reference. The installed Expo sources stay unchanged; an unexpected factory
source hash receives a compatibility diagnostic before building.

Run the iOS native gate above with a final `--expo` argument. Its Expo scenarios
exercise native file persistence, Constants, autolinked SafeAreaProvider,
application/module lifecycle and Expo Location permission denial/grant. The
renderer is replaced while an actual Expo permission dialog is pending; a
retired continuation must not save through Tauri. Memory-warning/background-fetch
checks inject callbacks through the original application delegate. These are
distinct from OS location prompts and custom-scheme URL delivery.

This path consumes installed modules and an offline bundle. Expo clean prebuild,
config-plugin native modifications, development hosts and custom scene/delegate
owners still require their own integration and execution evidence.

Current CLI iOS exports preserve a failed session open's complete ABI response
in `NSError.userInfo[@"TauriNativeRuntimeResponse"]`. Both SDKs forward its
original code and message, including `caller_denied` for an undeclared caller.
Older iOS exports fall back to `runtime_error` with the legacy description;
regenerate those artifacts with the current CLI to receive structured open errors.

The native gates also require an undeclared caller's original error code/message.
Test-only controls replace the renderer while its OS permission request is pending.
After the grant, the old continuation must not save a note; the new renderer must
observe the permission, retain original Tauri state and save through the real plugin.
The earlier four-platform packed arm64 Release execution records these scenarios
on iOS Simulator and Android emulator: [41 native UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-sdk-permission-retirement-2026-09-11.json).

## Remaining roadmap

Expo CNG, broader third-party autolinking, OS Universal Link
association, full navigation/history/back/rotation, Activity recreation,
device/adopter acceptance and full framework
parity remain tracked in [#45](https://github.com/gronxb/tauri-native/issues/45)
and [#47](https://github.com/gronxb/tauri-native/issues/47). The pinned native gates
cover RN-owned Android permissions and borrowing one original Tauri WebView;
broader lifecycle and source configurations require separate execution evidence.
The default format 1 view/reader cannot
consume a retained artifact. This checkout's changes are not a new npm release.
