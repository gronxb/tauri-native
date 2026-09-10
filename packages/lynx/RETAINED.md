# Retained Tauri integration

This checkout adds `@tauri-native/lynx/retained` for an ordinary Tauri app exported
with `--runtime retained`. The original Tauri platform bootstrap, Rust app,
managed state, WebView, capabilities and plugin registry remain alive. Lynx is a
renderer in that application. The producer has no Lynx dependency or command bridge.

## JavaScript

Open a session in a background effect/event after the original Tauri document is
ready. The caller name must exist in the export's `callers.json`. Native caller
delegation and the original Tauri capability are both enforced for every command
and event batch.

```ts
import { openTauriSession } from '@tauri-native/lynx/retained';

async function start() {
  'background only';
  const session = await openTauriSession('native');
  const unlisten = await session.listen('fieldnotes-updated', event => {
    console.log(event.payload);
  }, error => {
    // Refetch application state after event_overflow or invalid_event_payload.
    console.error(error);
  });
  const result = await session.invoke('list_notes', {});
  await unlisten();
  await session.close();
  return result;
}
```

Commands retain `{ ok: true, value }` and `{ ok: false, error }` responses,
including structured producer errors. Local cancellation/close and transport
errors reject the promise; runtime denials preserve their response and `code`.
An invoke promise supports `cancel()` and an optional third `{ signal }`
argument. Cancellation retires delivery; executing Rust side effects may finish.
Sessions remain open while idle so their subscriptions persist. Close the session
in the renderer's cleanup. Native surface destruction also closes it when JS
cannot run cleanup.

`listen` resolves to an asynchronous, idempotent unsubscribe function. Unlisten
discards queued events; close releases every native listener and pending request.
The client polls while listeners exist, handles a registration acknowledgement
arriving after its first event, and reports overflow without silently accepting
an incomplete batch. An authorization or transport failure closes the stream.
Registering another listener after a fatal stream error requires a new session.

## Android integration under development

The package exposes a source-free composer for a validated format 2 artifact and
an offline Lynx bundle. No React Native dependency or Rust toolchain is needed:

```js
const { composeAndroid } = require('@tauri-native/lynx/compose');

const result = composeAndroid({
  artifactsDir: './runtime/android',
  outputDir: './generated-android',
  bundleFile: './dist/main.lynx.bundle',
});
console.log(result.project, result.activity);
```

Build the bundle with the consumer's normal Lynx toolchain first and create the
output's parent directory. Keep the artifact, installed SDK and bundle outside
the output directory. Build `result.project` with Gradle; the consumer supplies
Release signing. The integration pins Lynx 4.0.1/PrimJS 4.0.0 with the standard
Tauri AGP 8.11.0, Kotlin 1.9.25 and compile SDK 36 configuration.

The composer copies the original project and preserves its plugin/bootstrap,
manifest permissions, assets and native libraries. It opens the copied original
`MainActivity` for inheritance, keeping its `enableEdgeToEdge` and superclass
startup. Generated `TauriNativeActivity` initializes Lynx, waits for actual Tauri
runtime/document readiness, attaches the surface and forwards resume/pause and
destruction. The original Tauri/Wry Activity retains plugin and Intent handling.
The SDK compiles the original `RuntimeSession.java` exactly once in a shared
library and selects only ABIs present in the export.

The default surface fills a container above the original WebView, with system-bar
and cutout insets. A native consumer subclass can override
`createLynxContainer(webView)`, `isTauriDocumentReady(webView)` and
`onLynxHostAttached()` and use `tauriLynxHost` for reload/removal. Preserve original
superclass callbacks. These hooks do not implement the planned Lynx `TauriView`.

The RN and Lynx packages share generated-file ownership and replacement logic
while remaining independently installable. A repeated invocation is a no-op;
bundle/artifact upgrades preserve unrelated consumer files. Changed generated
files, corrupt input, incompatible owners/toolchains, competing renderer setup,
symlinks and new file collisions receive diagnostics. Failed replacement restores
the previous output; failed rollback preserves it in the reported backup.
The current automatic path requires the pinned standard single Tauri Activity;
custom Activity/Application owners need separate integration evidence.

For explicit native integration, the lower-level host remains available:

Use `android/retained` as the `:tauri-native-lynx` Gradle library, with the exported
`RuntimeSession.java` compiled once in `:tauri-native-runtime-client`. The latter
is an Android library with namespace `dev.taurinative.runtime`, minimum SDK 24,
compile SDK 35 and Java 17. The original application still links the artifact's
Rust library and original Tauri/native plugin projects. Preserve the artifact's
ProGuard rules and constrain application `ndk.abiFilters` to the artifact's
native ABIs so the APK cannot advertise a renderer-only architecture without
Tauri. Do not also link the default format 1 `android` library.

The package's `TauriLynxHost.initialize(application)` cooperates with Lynx's
existing initialization. Construct `TauriLynxHost(container, templates, bundle)`
on main after the existing Tauri WebView is ready; `container` is a consumer-owned
view group and `templates` is Lynx's ordinary `AbsTemplateProvider`. This host
registers `TauriNativeRuntime` with a scope owned by that surface, attaches the
Lynx view, and retires the scope before destroying or reloading the view.

Forward Activity `onResume`, `onPause`, and `onDestroy` to the host's `onResume()`,
`onPause()`, and `close()`, preserving all original `super` calls. Use `reload()`
to replace only the renderer. Backgrounding and native permission dialogs keep
the session alive. Native module destruction provides an additional idempotent
cleanup path. No new Activity, Tauri app or plugin registry is started by the SDK.

The checked-in native gate is
`node --experimental-strip-types packages/lynx/test/retained-android.ts <artifact>`
with `ANDROID_SERIAL`, Android SDK/JDK and Maestro configured. It consumes an
arm64 Release export of the ordinary mobile Fieldnotes fixture, packs this SDK,
and builds a relocated non-debuggable Release/R8 consumer without Rust on PATH.
The acceptance subclass owns only layout, baseline readiness and telemetry;
the packed composer owns attachment/startup/lifecycle integration. The gate
removes Lynx and continues interacting with the original Tauri frontend. A
second clean-installed Release APK executes the unmodified generated Activity
and default layout without acceptance hooks. Both APKs retain identical native
libraries and undergo 16 KB alignment checks.

## iOS integration under development

On macOS, the package can generate the original Tauri Xcode app plus Lynx
integration from the same artifact contract:

```js
const { composeIos } = require('@tauri-native/lynx/compose');

const result = composeIos({
  artifactsDir: './runtime/ios',
  outputDir: './generated-ios',
  bundleFile: './dist/main.lynx.bundle',
});
console.log(result.project, result.workspace, result.target, result.minimumOsVersion);
```

Use the same directory ownership rules as Android. The composer reads the
original project using Apple's `plutil`, preserves its native client/archive,
permission descriptions, schemes and assets, and adds SDK registration before
the unchanged `ffi::start_app()`. The consumer uses the highest of Lynx's 14.0
minimum and all explicit original deployment targets. Original input bytes stay
unchanged. One standard Tauri app target/main/WebView is supported; existing
CocoaPods, Node environment files, custom startup/scene ownership or native build
scripts require explicit integration.

Run `pod install` in `result.project`, then build the returned workspace and
original target. The generated Podfile validates its owned files before CocoaPods
runs and records only CocoaPods' project rewrite after integration. Other edited
files or a changed receipt fail validation. Identical generation is a no-op before
installation; generation after pod installation restores the original project
plus SDK configuration, so install pods again before building. Unrelated files
and Pods caches are preserved. RN and Lynx share this receipt implementation
without depending on each other's package.

`TNLynxComposition` observes the original launch notification, waits for runtime
and document readiness and attaches Lynx within the original parent's safe area.
It keeps the original application delegate, window and root controller. Main-thread
`reload`, `close` and `host` expose the current renderer's lifetime. Native
subclasses may override `isTauriDocumentReady:`, `createLynxContainer:` and
`lynxHostDidAttach`; install the subclass in a consumer-owned entry point and
resolve that main-file edit before regenerating owned output. These hooks do not
implement the planned Lynx `TauriView`.

The lower-level host and Podfile helper remain available for explicit attachment.
In the exported original iOS project's Podfile, add the packed SDK as a local
dependency:

```ruby
require_relative '../node_modules/@tauri-native/lynx/ios/retained/pods'
platform :ios, '14.0'
use_modular_headers!
target 'your-original-tauri-target' do
  pod 'TauriNativeLynxRetained', :path => '../node_modules/@tauri-native/lynx/ios'
end
post_install do |installer|
  TauriNativeLynxRetained.post_install(installer, 'your-original-tauri-target')
end
```

Use the original target name and the path to your installed package. Keep its
existing build configuration mapping, run `pod install`, then build the
workspace. The pod pins Lynx 4.0.1 and PrimJS 4.0.0 and uses the format 2
`Sources/TauriNativeRuntime/TNRuntimeSession.h` beneath the original iOS project.
The original app target already compiles that platform client; compile it only
once. Link the original artifact's runtime and plugins and preserve Info.plist,
entitlements and assets. Do not also link the default format 1 SDK pod.

The post-install helper replaces CocoaPods' global `-ObjC` with `-force_load`
for the five pinned renderer libraries. This preserves their Objective-C
categories without eagerly loading repeated transitive Swift objects inside
Tauri's original archive. It leaves that archive unchanged and rejects additional
pods or framework linkage pending compatibility evidence. Keep this hook when
running CocoaPods again; omitting it can cause duplicate Tauri/Swift symbols.

After the original Tauri document is ready, create a host in a consumer-owned
container on main:

```objc
#import <TauriNativeLynxRetained/TNLynxHost.h>

TNLynxHost *host = [[TNLynxHost alloc] initWithContainer:container
                                              bundle:bundleData
                                                 url:@"main.lynx.bundle"];
```

Keep the host alive for the surface's lifetime. Call `reload` to replace its
renderer or `close` to remove it, both on main. The host retires the native
scope before clearing the Lynx engine and forwards application active/inactive
notifications. It does not replace the original UIApplication delegate or call
Tauri startup. Backgrounding and native permission dialogs preserve sessions.

The native gate is
`node --experimental-strip-types packages/lynx/test/retained-ios.ts <artifact>`
with an arm64 `IOS_SIMULATOR_UDID`, Xcode, CocoaPods and Maestro configured. It
packs the SDK, composes a relocated consumer, installs pods, regenerates and
installs pods again before building Release without Rust. The acceptance subclass
provides only layout, baseline readiness and telemetry; the packed SDK owns
startup observation, readiness, attachment and session lifetime. The gate removes
Lynx while the original frontend continues, then builds a second Release app
with unmodified generated startup/default layout and no acceptance subclass.
Run macOS metadata/ownership scenarios with
`node --experimental-strip-types --test packages/lynx/test/retained/compose-ios.test.ts`.

Current CLI iOS exports preserve a failed session open's complete ABI response
in `NSError.userInfo[@"TauriNativeRuntimeResponse"]`. Both SDKs forward its
original code and message, including `caller_denied` for an undeclared caller.
Older iOS exports fall back to `runtime_error` with the legacy description;
regenerate those artifacts with the current CLI to receive structured open errors.

The native gates also require an undeclared caller's original error code/message.
Test-only controls replace the renderer while its OS permission request is pending.
After the grant, the old continuation must not save a note; the new renderer must
observe the permission, retain original Tauri state and save through the real plugin.
All four packed arm64 Release gates pass these scenarios on iOS Simulator and
Android emulator: [41 native UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-sdk-permission-retirement-2026-09-11.json).

## Remaining roadmap

Third-party Lynx autolinking, retained `TauriView`,
cross-renderer artifact parity, and complete M8
acceptance remain tracked in [#46](https://github.com/gronxb/tauri-native/issues/46)
and [#47](https://github.com/gronxb/tauri-native/issues/47). The format 1 view cannot
be used as a retained view. This API is not a claim of a published npm release.

## Source-free artifact reader

`@tauri-native/lynx/retained-artifacts` exports `readRetainedArtifacts(directory)`
for complete format 2 / ABI 3 validation before integration. It uses Node.js
without loading Lynx, Rust or producer sources, and checks the native inventory,
pinned runtime/plugin versions and build receipts. It shares its implementation
with the RN package. Use the separate `compose` entry point to generate native
integration for Android or iOS.
