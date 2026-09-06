# @tauri-native/cli

Export existing Tauri commands and a web frontend for React Native and Lynx hosts. The CLI owns the generated Rust workspace, dispatcher, C ABI and header. The producer does not need an application-specific core crate, new macros, a Rust SDK or a second command registry.

## Install and inspect

```sh
npm install --save-dev @tauri-native/cli@experimental
npx tauri-native inspect
npx tauri-native inspect --json
```

Run from the Tauri project root, or select its Rust directory with `--tauri-dir`. Inspection uses Cargo metadata and the existing literal `generate_handler!` registration; it does not build or start the application or run frontend hooks. The JSON result includes registered commands, argument keys/types, original source locations, frontend build inputs and ABI version. Unsupported forms produce source diagnostics and a failing exit code.

Node.js 22.12+ and Rust are required. The package includes its Rust parser sources and a lockfile. On first use, the CLI compiles that small tool into the system temporary cache; subsequent calls reuse it. The producer gets no new Cargo dependency.

The current verified subset is synchronous root commands on resolved Tauri 2.11.5 with an existing Cargo.lock, ordinary Builder/build-script setup and local JSON configuration. Cargo workspace members, custom library names/paths and string or `{script, cwd}` frontend hooks are discovered. Module/cfg registration, runtime objects, plugins, custom initialization/build scripts, configuration overlays and application ACLs fail explicitly. The producer's dependency version range can remain unchanged: verification reads the resolved lockfile. See the repository's [compatibility contract](https://github.com/gronxb/tauri-native/blob/main/docs/compatibility.md).

## Export

```sh
npx tauri-native export ios
npx tauri-native export android
```

Both commands default to the ordinary `src-tauri/Cargo.toml`. The CLI copies the project into a disposable workspace, generates the adapter beside the existing private command functions, and runs the configured frontend hook in that copy. It owns native crate types and header generation. Authored source, Cargo manifests/lockfiles and Tauri configuration remain unchanged. Local workspace dependencies keep their relative paths; dependencies that would retain a second Tauri runtime or escape the copied project are rejected.

For iOS, install Xcode and the iOS Rust targets. The default `src-tauri/gen/tauri-native/ios` output contains:

- `TauriNativeCore.xcframework` — arm64 device and arm64/x86_64 Simulator slices, with the generated header.
- `TauriNativeAssets.bundle` — the configured frontend build output.
- `TauriNativeGenerated.podspec` — local Pod integration for the host.
- `commands.json` — registered command metadata without producer paths.
- `manifest.json` — ABI/compatibility versions, native slices, input fingerprints and file checksums.

iOS export validates the complete file inventory, real library architectures and ABI symbols before atomically publishing the directory. Failed builds preserve the previous export. Select a dedicated output folder; unrelated host files are rejected. The sibling asset bundle preserves frontend bytes and reserves its own `Info.plist`. See [portable artifact integration](https://github.com/gronxb/tauri-native/blob/main/docs/artifacts.md) for CocoaPods/manual Xcode setup, manifest details and the installed-CLI relocation gate.

For Android, install the Android NDK and `cargo-ndk`:

```sh
cargo install cargo-ndk --locked
```

The default `src-tauri/gen/tauri-native/android` output contains `jniLibs/<abi>/libtauri_native_core.so` for arm64-v8a, armeabi-v7a, x86 and x86_64, plus `assets/tauri-native`, a generated C header, command metadata and the shared integrity manifest. Android export targets API level 24 and validates every ELF's architecture, API identification, ABI exports, normalized SONAME and 16 KB alignment. Both platforms use staged publication and preserve the prior output on failure. The currently verified producer environment and atomic replacement implementation are macOS; the native host does not need the CLI or Rust.

Copy the platform directory to its host, or write it there directly:

```sh
npx tauri-native export ios --output-dir ../mobile-app/ios/tauri-native
```

Hosts install the matching React Native or Lynx bridge package. They consume native artifacts and frontend assets; the CLI belongs in the producer project. Full copied-artifact onboarding and platform release certification are tracked by the remaining roadmap milestones.

## Protocol and legacy integration

Generated ABI 2 includes the versioned invoke/free functions and request-session functions for nonblocking execution. Every non-null response is owned UTF-8 JSON and must be freed exactly once. The private frame identifies `abiVersion: 2`. WebViews resolve ordinary Tauri `invoke` with the success value or reject it with the original serialized error. Host SDK `invoke` returns a cancellable Promise of the result envelope; `invokeSync` retains explicit blocking/legacy use. See [the async contract](../../docs/adr/0005-async-request-sessions.md).

The explicit `--manifest <core/Cargo.toml>` option retains the old application-owned ABI path; iOS also accepts `--header`. Existing calculator example scripts select this legacy path while their host migration is pending. Neither option is needed for ordinary source export. Legacy envelopes remain supported by the updated host packages.

## Generated host types

Generated exports include a checksummed `commands.ts` contract derived from existing Rust commands and ordinary serde declarations. Both host SDKs use the same `createCommands(invoke)` binding from the copied artifact. The producer frontend keeps its Tauri imports. See [the supported typing subset and verification](../../docs/command-types.md); unsupported projections remain `unknown` with explicit diagnostics.

## License

MIT
