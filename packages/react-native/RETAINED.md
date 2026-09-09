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

Keep the complete format 2 export. In its original Android project, compile
the exported `RuntimeSession.java` once in an Android library named
`:tauri-native-runtime-client`, with namespace `dev.taurinative.runtime`, minimum
SDK 24 and Java 17. Link the original runtime and native plugin projects from
the app. Include the installed SDK's `android/retained` directory as
`:tauri-native-react` and add both libraries as app dependencies. Do not also
link the default format 1 SDK library or another `appmodules` library.

The original root Gradle build must provide these `extra` values:

| Value | Meaning |
| --- | --- |
| `tauriNativeReactNativeDir` | Resolved installed React Native directory. |
| `tauriNativeReactCodegenDir` | Resolved `@react-native/codegen` directory for that RN installation. |
| `tauriNativeNode` | Absolute Node executable for standard RN codegen. |
| `tauriNativeAbis` | List of Android ABI names in the artifact's native slices. |

Resolve dependency paths through Node's `require.resolve` from the installed RN
package, including pnpm's real package path. The SDK runs RN's standard schema
and native code generators on its isolated `retained/specs` source. These specs
are separate from the format 1 package's codegen input. The host needs its normal
Node/RN toolchain; it needs neither Rust nor the producer checkout.

Use compile SDK 36 and Kotlin 2.1.20 for the original app's native compilation.
Constrain application `ndk.abiFilters` to `tauriNativeAbis` and select one matching
`libc++_shared.so` when merging RN/Hermes native dependencies. Preserve the
artifact's R8 rules, permission declarations, assets and native Tauri projects.

With the original AGP 8.11.0 build, set `android.lint.useK2Uast=false` in the
consumer's `gradle.properties`. Its K2 lint analyzer crashes on applied Kotlin
Gradle scripts ([upstream issue](https://issuetracker.google.com/issues/430991549)),
including Tauri's `tauri.build.gradle.kts`. This selects the K1 analyzer while
keeping Release lint checks enabled; it does not change Kotlin compilation.

Call `TauriReactHost.initialize(application)` on main before the original
Activity's `super.onCreate`. After the original Tauri document is ready, attach
to a consumer-owned container:

```kotlin
host = TauriReactHost(this, container, "YourApp", "index.android.bundle")
```

Forward Activity resume/pause, new Intents, activity results, window focus and
configuration changes to the corresponding host methods, preserving original
`super` calls. Apply the current resume/focus state when attaching after launch.
The package installs its own lifecycle-bound AndroidX back callback: RN's
`BackHandler` receives the event, and an unhandled back delegates to the original
dispatcher. `onNewIntent` forwarding lets RN `Linking` receive the same Intent
that the original Tauri plugin path receives.

`reload()` replaces the RN engine and re-renders its surface while retaining
Tauri. `close()` retires native sessions immediately, removes the RN view/back
callback and asynchronously destroys RN; `destroyed` becomes true when cleanup
finishes. Call `close()` during Activity destruction as well. All host methods
run on main. Permission dialogs/backgrounding keep native sessions alive.

The native gate is
`node --experimental-strip-types packages/react-native/test/retained-android.ts <artifact>`
with `ANDROID_SERIAL`, Android SDK/JDK and Maestro configured. It packs the real
SDK, bundles its compiled public entry, and builds a relocated non-debuggable
Release/R8 consumer without Rust on PATH. The fixture owns consumer layout,
Activity hooks and telemetry; the SDK owns the generated module, RN engine,
surface, back routing and native session lifetime.

## iOS integration under development

This path pins RN/codegen 0.86.3 and its matching prebuilt React,
ReactNativeDependencies and Hermes frameworks. The composed consumer requires
iOS 16.4 or later. The ordinary producer and immutable exported artifact keep
their original deployment settings; the RN consumer raises its minimum OS.

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
with `IOS_SIMULATOR_UDID`, Xcode, CocoaPods and Maestro configured. Its consumer
fixture owns layout, pre-start notification registration and process telemetry.
The SDK owns the actual generated module, Factory and native session lifetime.

## Remaining roadmap

Automatic composition/autolinking, Expo CNG, iOS Linking URL forwarding, retained
`TauriView`, consistent session-open diagnostics, broader lifecycle/device/adopter acceptance and full framework
parity remain tracked in [#45](https://github.com/gronxb/tauri-native/issues/45)
and [#47](https://github.com/gronxb/tauri-native/issues/47). Forwarded hooks alone
do not establish every native scenario: activity recreation, RN-owned permission
requests and renderer destruction during a pending Tauri OS permission callback
still need their own execution evidence. The default format 1 view/reader cannot
consume a retained artifact. This checkout's changes are not a new npm release.
