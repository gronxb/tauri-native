# @tauri-native/lynx

Experimental Lynx native library for `tauri-native`.

The retained Tauri integration under `@tauri-native/lynx/retained` is being
implemented in this checkout. It uses format 2 / ABI 3 exports and the original
Tauri Mobile bootstrap. Its Android package owns the Lynx surface and native
sessions; automatic native composition, retained `TauriView`, and iOS package
integration are still open. The default entry point and autolinking configuration
below continue to describe format 1. See [retained integration](./RETAINED.md)
before choosing the artifact mode.

## Install

The earlier 0.1.0 release predates the source-export and async APIs documented here. For this checkout, install the matching candidate tarball using the [Fieldnotes walkthrough](https://github.com/gronxb/tauri-native/blob/main/docs/examples/fieldnotes.md). This checkout prepares 1.0.0-rc.0; its version alone does not establish npm availability. The registry command below selects the published experimental release. See [migration](https://github.com/gronxb/tauri-native/blob/main/docs/migration.md) for the API changes.

```sh
npm install @tauri-native/lynx@experimental
```

The producer installs `@tauri-native/cli` in its ordinary Tauri project and exports there:

```sh
npx tauri-native export ios
npx tauri-native export android
```

Transfer the **whole** `ios/` and `android/` export directories into the Lynx host's `tauri-native/` folder. These are the same platform artifacts consumed by RN; there is no Lynx-specific export. The host needs neither the CLI, RN package, producer checkout nor Rust. Manifest format 1 requires the corresponding CLI/host implementation; the earlier experimental 0.1.0 release predates artifact-only configuration.

Validate received files with the Node-only reader shipped in this package:

Reader errors expose stable `.code` values shared with optional CLI `doctor --artifacts`. Both flows work without Rust or producer access; see [diagnostics](https://github.com/gronxb/tauri-native/blob/main/docs/diagnostics.md).

```sh
node --input-type=module -e "import {readArtifacts} from '@tauri-native/lynx/artifacts'; readArtifacts('./tauri-native/ios','ios'); readArtifacts('./tauri-native/android','android')"
```

The reader checks platform, ABI, layout and the complete file inventory/checksums. Missing, changed, linked or incompatible files fail without a source fallback. The reader shares its implementation with RN, but each package contains its own copy. The manifest is an integrity receipt, not a publisher signature.

For iOS, add the host-owned export as a local Pod before calling `use_lynx_library!`, then run `pod install` from the host's `ios/` directory:

```ruby
export_dir = File.expand_path('../tauri-native/ios', __dir__)
pod 'TauriNativeGenerated', :path => export_dir
```

For Android, enable the Lynx 4.0.1 Native Library plugins in the host, then add the export directories to the application source set:

```groovy
// settings.gradle
plugins {
  id 'org.lynxsdk.lynx.library-settings' version '4.0.1'
}

// app/build.gradle
plugins {
  id 'com.android.application'
  id 'org.lynxsdk.lynx.library-build'
}

android.sourceSets.main {
  assets.srcDir '../../tauri-native/android/assets'
  jniLibs.srcDir '../../tauri-native/android/jniLibs'
}
```

Run artifact validation before native integration/build. The example's Podfile and Gradle configuration call its `scripts/validate-artifacts.ts` directly; npm build commands validate first too. Keep the complete directory together when upgrading, replace the received platform directory rather than merging stale files, and run `pod install` after iOS replacement so CocoaPods refreshes the contained archive's link settings.

## API

```tsx
import { appDataDir, TauriView, invoke } from '@tauri-native/lynx';

async function searchNotes(query: string) {
  'background only';
  return invoke('search_documents', { directory: await appDataDir(), query });
}

<TauriView style={{ height: '420px' }} />;
```

`invoke` returns a Promise of `{ ok: true, value }` or `{ ok: false, error }`. Transport failures reject the Promise. ABI 2 artifacts execute commands on Rust workers; rebuild older artifacts with the CLI to use this API. The previous blocking API is available as `invokeSync`, including for ABI 0/1 migration. The retained calculator fixture requires that legacy path; the example above uses Fieldnotes artifacts.

The returned Promise has a `cancel()` method. You can also pass `{ signal }` as the third argument when your host provides `AbortSignal`. Cancellation rejects with `AbortError`, removes queued work and discards a running request's result; it does not interrupt Rust code or undo side effects. The native module closes outstanding sessions when its runtime is destroyed. Busy clients poll every 16 ms and release their session when idle.

The embedded frontend keeps using ordinary `@tauri-apps/api/core.invoke`. Removing its view or leaving its document closes its session and suppresses late results. ABI 0/1 WebView compatibility retains the previous execution behavior; nonblocking execution requires ABI 2.

The package follows the official Lynx Native Library layout. It exposes a typed native module for direct Rust invocation and a `tauri-view` custom native element backed by Swift `WKWebView` on iOS and Android `WebView` on Android. On both platforms, the Lynx 4.0.1 runtime exposes the direct module through its JSI-backed `NativeModules` path before continuing through Objective-C++ on iOS or JNI on Android to the shared Rust C ABI. The package itself depends only on Lynx's public Native Module API.

The example hosts initialize `LynxEnv`, load the local `main.lynx.bundle` through a template provider, and render a `LynxView` as described by Lynx's existing-app guides. iOS uses CocoaPods and Android uses the Native Library Gradle plugins for [autolinking](https://lynxjs.org/guide/autolink). Both include `XElement` because the example renders a native `<input>`.

This package is experimental and supports iOS and Android. See the root README for the complete build and integration contract.

## View lifecycle and local interaction

`TauriView` accepts a local `path` (including query/fragment), `onLoadStart`,
`onReady`, `onLoadError`, `message` and `onEvent`. A new message ID sends once
to the ready current document; navigation does not replay the last message.
The frontend uses the verified standard Tauri `Webview/main` event subset.
See the [view contract and examples](https://github.com/gronxb/tauri-native/blob/main/docs/view-interaction.md)
for readiness, payloads, cleanup and unsupported global/window behavior.

## Generated command types

Current generated artifacts include `commands.ts`. Import its `createCommands` and connect the host SDK's `invoke` to infer command names, inputs, success and error values:

```ts
import { invoke } from '@tauri-native/lynx';
import { createCommands } from './Native Artifacts/commands';
const command = createCommands(invoke);
```

Use command names and inputs from your exported application. Copy the complete artifact so contracts and binaries stay together. `typeDiagnostics` identifies custom serialization, large integers and other unknown projections; see [the supported typing subset](https://github.com/gronxb/tauri-native/blob/main/docs/command-types.md). The producer frontend keeps its ordinary Tauri imports.

## License

MIT

## Persistent application data

`await appDataDir()` returns the host-private directory also exposed by the embedded frontend's standard Tauri `appDataDir()` call. Import it from this package and pass it to your ordinary Rust commands when they need a persistent location. The application creates its own files and subdirectories. Only this path operation is supported; see the [Fieldnotes storage contract](https://github.com/gronxb/tauri-native/blob/main/docs/examples/fieldnotes.md#application-data-directory-contract) for platform paths, sharing and limitations.
