# Retained Tauri integration

This checkout adds `@tauri-native/lynx/retained` for an ordinary Tauri app exported
with `--runtime retained`. The original Tauri Activity, Rust app, managed state,
WebView, capabilities and plugin registry remain alive. Lynx is a renderer in
that application. The producer has no Lynx dependency or command bridge.

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
and builds a relocated native consumer without Rust on PATH. Its fixture owns
layout/bootstrap hooks and telemetry; calls, events and renderer teardown use
the packed package. It does not prove automatic composition or iOS support.

## Remaining roadmap

Automatic source-free composition and Lynx autolinking, retained `TauriView`,
iOS native integration, cross-renderer artifact parity, and complete M8
acceptance remain tracked in [#46](https://github.com/gronxb/tauri-native/issues/46)
and [#47](https://github.com/gronxb/tauri-native/issues/47). The format 1 view cannot
be used as a retained view. This API is not a claim of a published npm release.
