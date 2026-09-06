# Portable native artifacts

The producer installs `@tauri-native/cli` and exports its ordinary Tauri project. Copy the **whole platform directory** to the mobile host. The host builds with its native tools and bridge package; it does not need the producer checkout, Cargo, Rust source, or the CLI.

## iOS

```sh
# In the ordinary Tauri project, with Xcode and Rust installed:
npx tauri-native export ios
cp -R src-tauri/gen/tauri-native/ios ../mobile-app/ios/tauri-native
```

| Path | Purpose |
| --- | --- |
| `TauriNativeCore.xcframework` | Static library and generated C header for arm64 iOS devices and arm64/x86_64 simulators. |
| `TauriNativeAssets.bundle` | The configured frontend output, plus bundle `Info.plist`. Resources are a sibling of the XCFramework. |
| `TauriNativeGenerated.podspec` | Local CocoaPods integration. |
| `commands.json` | Registered command names, argument keys/Rust types and source locations; no source path. This is metadata, not yet a generated TypeScript SDK. |
| `manifest.json` | Format/ABI/CLI versions, verified API contract, native slices, source fingerprints and relative file checksums. |

For CocoaPods, add this inside the host target in `ios/Podfile`, then run `pod install` in the host:

```ruby
pod 'TauriNativeGenerated', :path => './tauri-native'
```

For manual Xcode integration, add the XCFramework to the host's linked libraries without embedding the static library. Add `TauriNativeAssets.bundle` to Copy Bundle Resources. Import the selected slice's `Headers/tauri_native.h` through the host's bridging header or C/Objective-C includes. The minimum iOS deployment target is 13.0. Keep the whole export directory together so metadata and binary versions move together.

A custom native consumer checks `tauri_native_abi_version() == 1`, calls `tauri_native_invoke(command, payloadJson)`, copies the returned UTF-8 JSON, and calls `tauri_native_string_free` exactly once for every non-null result. ABI 1 frames contain `{abiVersion:1,ok:true,value}` or `{abiVersion:1,ok:false,error}`. Serialize arguments as JSON. The host owns lifecycle and does not start another Tauri runtime.

React Native/Expo and Lynx artifact-only configuration is tracked separately in issues [#11](https://github.com/gronxb/tauri-native/issues/11) and [#12](https://github.com/gronxb/tauri-native/issues/12). The native relocation gate below verifies a minimal independent UIKit/WKWebView consumer; it does not certify those host packages or physical-device execution.

## Manifest contract

Format 1 uses relative POSIX file paths. `files` contains each exported file's SHA-256 and byte count, excluding `manifest.json` itself. Validation checks the full inventory: missing, changed, duplicate or extra files and symlinks are errors. The manifest is an integrity record, not a signature or proof that a third party's artifact is trustworthy.

`native` describes library paths, architectures and device/simulator variants. iOS export checks XCFramework metadata, actual archive architectures, ABI symbols in every architecture and the generated ABI header before publishing. It inspects machine-code symbols instead of asking Xcode's possibly older LLVM reader to parse embedded Rust bitcode.

`compatibility` identifies the generated ABI contract verified against Tauri 2.11.5 and `@tauri-apps/api` 2.11.1. This is a tested compatibility pair, not a claim that the producer installed that exact JavaScript package. Unsupported behavior is described in the [compatibility contract](compatibility.md).

`source` records SHA-256 fingerprints for the original Rust entry, selected Cargo manifest, existing workspace lockfile and Tauri JSON configuration. `frontendSha256` hashes the sorted frontend file inventory before bundle metadata is added. These named fingerprints are provenance for those inputs; they are **not a complete dependency graph or incremental cache key**. No original absolute paths, environment variables or source contents are stored in the manifest.

Explicit legacy `--manifest`/`--header` export emits ABI 0 metadata, no verified Tauri/API compatibility and no `commands.json`. Its input fingerprints cover the selected legacy manifest/header/configuration. A manually owned ABI 0 artifact is not a generated ABI 1 artifact.

## Publication and failure behavior

`--output-dir` must name a dedicated generated directory, for example `mobile-app/ios/tauri-native`. A folder containing unrelated top-level host files is rejected before building. Do not select the host's entire `ios` directory.

The CLI builds in an adjacent temporary directory and validates all output before publication. A first export uses a directory rename; on macOS, replacing an existing export uses the filesystem's atomic directory exchange. A failed build, validation error or interruption before publication leaves the prior export intact. Unsupported filesystems fail without falling back to a destructive replacement. Force-killing a process can leave an adjacent `.NAME-stage-*` directory; it is disposable and is never a published export.

Frontend bytes are preserved. `frontendDist/Info.plist` is reserved for the iOS bundle metadata and is rejected instead of silently overwritten. Re-run export to change generated content; editing individual files invalidates the manifest.

## Verification

On a configured Mac, install the workspace's example frontend dependencies and run:

```sh
nub --cwd packages/cli run test
nub --cwd packages/cli run test:export:contract
nub --cwd packages/cli run test:export:ios
```

The iOS gate packs and installs the CLI, exports the ordinary source fixture, compares authored source and frontend bytes, and copies the result into a path with spaces. It then deletes its producer and CLI installation. The independent host build has no Rust tools on PATH and uses only copied native artifacts/resources and its own Swift code. An available iOS Simulator executes direct native calls and the unchanged frontend's ordinary `@tauri-apps/api/core` calls. The gate removes its uniquely identified test app, deletes a simulator only if it created one, and writes evidence to `target/export-ios/report.json`. The device slice is compiled and inspected; this gate does not run on a physical iPhone.

Package tests exercise corrupted/missing output, incompatible ABI, actual SIGTERM interruption, successful replacement, unrelated host files and invalid manifest paths. A skipped native gate is not release evidence.
