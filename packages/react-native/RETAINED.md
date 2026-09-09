# Retained Tauri integration

This development path consumes an ordinary Tauri project exported with
`--runtime retained`. The original Tauri application, WebView, Rust managed
state, commands, capabilities and native plugins remain alive. The producer
does not import React Native or maintain a command bridge.

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
calls. These hooks do not replace the planned React `TauriView` component.

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
custom lifecycle owners require separate integration evidence. Expo CNG and
third-party module autolinking remain open.

`TauriReactHost` remains available for explicit native attachment. Its lifecycle
methods must receive the original Activity callbacks; the generated Activity
supplies these calls automatically. Its lifecycle-bound AndroidX back callback
sends events to RN `BackHandler` and delegates unhandled events to the original
dispatcher. RN `Linking` receives the same forwarded Intent as Tauri's own path.

`reload()` replaces the RN engine and re-renders its surface while retaining
Tauri. `close()` retires native sessions immediately, removes the RN view/back
callback and asynchronously destroys RN; `destroyed` becomes true when cleanup
finishes. Call `close()` during Activity destruction as well. All host methods
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
the owned main file. These hooks do not implement the planned React `TauriView`.

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
module observes ordinary UIApplication notifications. Forwarding original URL
callbacks into RN Linking is separate work; Tauri's own deep-link plugin and
events remain available through the retained session.

The native gate is
`node --experimental-strip-types packages/react-native/test/retained-ios.ts <artifact>`
with `IOS_SIMULATOR_UDID`, Xcode, CocoaPods and Maestro configured. It packs the
actual SDK, composes a relocated artifact, installs pods, regenerates, installs
pods again and builds Release without Rust on PATH. An acceptance subclass adds
only layout, baseline readiness and telemetry; the SDK owns startup observation,
attachment and lifetime. A second Release app runs the unmodified generated
startup/default layout without that subclass. Nine UI flows cover permissions,
plugins/events, replacement/removal and default integration. Run the separate
macOS metadata/ownership scenarios with
`node --experimental-strip-types --test packages/react-native/test/retained/compose-ios.test.ts`.

## Remaining roadmap

Third-party autolinking, Expo CNG, iOS Linking URL forwarding, retained
`TauriView`, consistent session-open diagnostics, broader lifecycle/device/adopter acceptance and full framework
parity remain tracked in [#45](https://github.com/gronxb/tauri-native/issues/45)
and [#47](https://github.com/gronxb/tauri-native/issues/47). Forwarded hooks alone
do not establish every native scenario: activity recreation, RN-owned permission
requests and renderer destruction during a pending Tauri OS permission callback
still need their own execution evidence. The default format 1 view/reader cannot
consume a retained artifact. This checkout's changes are not a new npm release.
