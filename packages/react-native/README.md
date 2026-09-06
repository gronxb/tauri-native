# @tauri-native/react-native

Experimental iOS and Android React Native bridge for a Tauri microfrontend and its Rust commands.

## Install

```sh
npm install @tauri-native/react-native@experimental
```

Install `@tauri-native/cli` in the separate Tauri project and export the platform artifacts there first:

```sh
npx tauri-native export ios
npx tauri-native export android
```

## Expo CNG

The package's Node-only artifact reader and Expo plugin expose stable error codes for missing, corrupt or incompatible exports. Optional CLI `doctor --artifacts` uses the same checks without Rust or producer access. See [diagnostics](https://github.com/gronxb/tauri-native/blob/main/docs/diagnostics.md).

Receive the whole `ios/` and `android/` export directories in a host-owned folder:

```text
mobile-app/
  tauri-native/
    ios/manifest.json
    ios/TauriNativeCore.xcframework/...
    ios/TauriNativeAssets.bundle/...
    ios/TauriNativeGenerated.podspec
    android/manifest.json
    android/jniLibs/...
    android/assets/tauri-native/...
    ... (keep every exported file)
```

Add the config plugin to `app.json`. `artifactsDir` is relative to the Expo project root. The host does not install the CLI or Rust and does not need the producer checkout.

```json
{
  "expo": {
    "plugins": [
      [
        "@tauri-native/react-native",
        { "artifactsDir": "./tauri-native" }
      ]
    ]
  }
}
```

Run `expo prebuild --platform ios` or `expo prebuild --platform android`. The selected platform's format, ABI, layout and complete file checksums are validated before generated host files are changed. Missing, changed or incompatible files require a complete matching export. On iOS, the plugin copies the export into `ios/tauri-native` and adds one local Pod entry. On Android, it copies the four ABI libraries and web assets into `android/app/src/main` before Gradle autolinks this package. Repeated prebuilds replace only those integration files and preserve unrelated host Pods, libraries and assets.

Expo SDK 57 recreates native directories by default. Use `expo prebuild --no-clean` when keeping manual native changes; the plugin itself preserves unrelated files. After replacing an iOS artifact, run `pod install` from `ios/`, including after `--no-clean` or `--no-install` prebuild. CocoaPods must refresh the XCFramework's link settings when its contained library changes; Expo may skip Pods when npm dependencies are unchanged. Native changes that must survive clean CNG belong in the host's config plugins.

The optional `tauriDir` convenience option still resolves `gen/tauri-native/<platform>` through the same validator. It never reads or builds producer source. Choose one option; older exports without `manifest.json` must be re-exported. Artifact-only configuration requires a CLI and host package version implementing manifest format 1; the earlier experimental 0.1.0 release predates this workflow.

## Bare React Native

Copy the received exports into `tauri-native/ios` and `tauri-native/android` in the host. Validate them with the installed host package before integrating:

```sh
node -e "const {readArtifacts}=require('@tauri-native/react-native/artifacts'); readArtifacts('./tauri-native/ios','ios'); readArtifacts('./tauri-native/android','android')"
```

Then add the generated Pod before running `pod install`:

```ruby
pod 'TauriNativeGenerated', :path => '../tauri-native/ios'
```

For Android, add the copied directories to `android/app/build.gradle`:

```groovy
android {
  sourceSets.main {
    jniLibs.srcDirs += ['../../tauri-native/android/jniLibs']
    assets.srcDirs += ['../../tauri-native/android/assets']
  }
}
```

React Native autolinks this package's native bridge. Build with Xcode/CocoaPods and Gradle/Android tools normally. Run `pod install` again after each iOS artifact replacement to refresh the XCFramework link settings. Keep the full artifact directories together when transferring or upgrading; individual edits invalidate the receipt. Native loading also checks the generated ABI version. The reader checks integrity, not publisher authenticity.

## API

```tsx
import { TauriView, invoke } from '@tauri-native/react-native';

const response = await invoke('calculate', { expression: '7 * (8 - 2)' });

<TauriView style={{ flex: 1 }} />;
```

`invoke` returns a Promise of `{ ok: true, value }` or `{ ok: false, error }`. Transport failures reject the Promise. ABI 2 artifacts execute commands on Rust workers; rebuild older artifacts with the CLI to use this API. The previous blocking API is available as `invokeSync`, including for ABI 0/1 migration. The calculator example deliberately uses that legacy path.

The returned Promise has a `cancel()` method. You can also pass `{ signal }` as the third argument when your host provides `AbortSignal`. Cancellation rejects with `AbortError`, removes queued work and discards a running request's result; it does not interrupt Rust code or undo side effects. The native module closes outstanding sessions when its runtime is destroyed. Busy clients poll every 16 ms and release their session when idle.

The embedded frontend keeps using ordinary `@tauri-apps/api/core.invoke`. Removing its view or leaving its document closes its session and suppresses late results. ABI 0/1 WebView compatibility retains the previous execution behavior; nonblocking execution requires ABI 2.

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
import { invoke } from '@tauri-native/react-native';
import { createCommands } from './Native Artifacts/commands';
const command = createCommands(invoke);
```

Use command names and inputs from your exported application. Copy the complete artifact so contracts and binaries stay together. `typeDiagnostics` identifies custom serialization, large integers and other unknown projections; see [the supported typing subset](https://github.com/gronxb/tauri-native/blob/main/docs/command-types.md). The producer frontend keeps its ordinary Tauri imports.

## License

MIT
