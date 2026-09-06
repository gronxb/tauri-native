# Source-transparent export spike

This gate began as the M0 experiment in [issue #5](https://github.com/gronxb/tauri-native/issues/5). It now executes the same discovery and workspace adapter used by the CLI.

## Run

Prerequisites: macOS with Xcode/Swift, a working Rust toolchain on `PATH`, and the repository's installed JS dependencies (`nub ci`). The checked-in fixture pins Tauri 2.11.5, `@tauri-apps/api` 2.11.1, and Vite 8.2.2. Cargo runs offline and locked, so the two fixture/generator lockfiles' dependencies must already be available. On a fresh machine, fetch them first:

```sh
cargo fetch --locked --manifest-path packages/cli/native/Cargo.toml
cargo fetch --locked --manifest-path packages/cli/test/fixtures/standard-tauri/src-tauri/Cargo.toml
nub --cwd packages/cli run test:export:spike
nub --cwd packages/cli run test:export:contract
```

The runner fails on missing prerequisites; it does not skip native checks. It uses the installed Tauri example JS dependencies to build a temporary copy of the ordinary fixture and verifies the pinned versions first. This is a repository-level experiment, not the later independent-package-consumer test.

Successful evidence is written to ignored `target/export-spike/report.json`, with source hashes, versions, native/frontend values, desktop IPC parity, ABI ownership counts and host-bridge results. The generated `.dylib` and Swift consumer are retained there. Temporary producer/build copies are removed. A failed run removes the previous success report before starting.

## What actually runs

1. Hash the ordinary producer's authored files, including Cargo manifests/lockfile, frontend, and Tauri config.
2. Build its unchanged frontend with Vite. The frontend imports only `@tauri-apps/api/core`.
3. Discover the project with Cargo metadata and `syn`, then prepare the same disposable workspace used by production export. Only registered root commands get ABI dispatch; the producer owns no dispatcher/header or native crate-type configuration.
4. Delete the entire generated copy, regenerate it, and check deterministic generated source.
5. The contract runner additionally checks the complete negative fixture corpus for unsupported source forms. These are **diagnostic** checks, not native implementations of those capabilities.
6. Compile the generated native library and load it through a Swift C ABI consumer. Check ABI 2, exercise 10,000 additional calls and assert every response has a matching free. Run the frontend in a real WKWebView. Compile and execute the actual RN/Lynx Objective-C++ bridges against valid and incompatible libraries; check UTF-8, errors and NUL-command rejection.
7. Build the original desktop application without changing its source.
8. Compile a separate public-API experiment: calling the private ordinary command produces Rust E0603, and accessing `InvokeMessage::new` produces E0624.
9. In a separate test-only copy, run the same requests through Tauri's real command macros and IPC with `tauri::test::MockRuntime`. Compare responses exactly after removing the internal ABI-version field. MockRuntime is never part of the exported adapter.
10. Change only the producer registry in another fixture copy and execute the newly registered command. Force a Rust type error in a separate copy and check the original source line and unchanged hashes.
11. Assert that producer/fixture hashes still match.

The scenarios cover a serde-renamed structured input/output, a tagged domain error, Unicode, default camelCase argument names, invalid/missing/null arguments, optional and unit results, adjacent-tagged enums, and an annotated but unregistered command.

`test:export:contract` also compiles the thirteen complete negative fixture overlays as ordinary Tauri applications, checks their repeated export rejection, and verifies Git/byte-hash integrity. Its versioned support matrix and authored-file budget are in [the compatibility contract](../../../../docs/compatibility.md). It retains aggregate evidence in `target/export-contract/report.json`.

## Boundaries

This proves the feasibility of generated adaptation for the demonstrated synchronous root commands in an ordinary scaffold. The analyzer remains conservative: custom macros/attributes, conditional registration and runtime-dependent helpers are rejected. It does not claim arbitrary Rust/Tauri runtime compatibility. Workspace discovery has separate CLI tests; full platform/host certification remains a later gate.

The native/frontend execution proof is on **macOS**. The ordinary desktop binary is built; the automated Tauri IPC comparison uses MockRuntime rather than driving that binary's visible window. No iOS/Android artifact or device claim follows from this result. The later platform milestones remain required.

See [ADR 0004](../../../../docs/adr/0004-source-transparent-export-spike.md) for the approach comparison, decision, and remaining gates.

## iOS artifact relocation gate

`nub --cwd packages/cli run test:export:ios` packs and installs the CLI, exports the ordinary fixture, copies its complete artifacts into a path with spaces and deletes the producer/CLI installation. It builds a host-owned Swift/UIKit/WKWebView app using only copied artifacts, with Rust absent from the host build PATH, and runs native plus unchanged frontend calls on an available iOS Simulator (with only its own test app removed afterward). It also checks failed frontend builds, missing real binary architectures and incompatible headers preserve the previous output. Evidence is written to `target/export-ios/report.json`. See [the artifact contract](../../../../docs/artifacts.md) for prerequisites and integration. Physical-device execution and RN/Lynx package integration remain separate gates.

## Android artifact relocation gate

With `ANDROID_HOME`, `JAVA_HOME`, cargo-ndk/NDK and one 16 KB emulator configured, run `nub --cwd packages/cli run test:export:android`. It installs the packed CLI, exports all four ABIs, deletes the producer/CLI installation and builds an independent Java/JNI/WebView APK from relocated artifacts with Rust absent from the host PATH. It verifies actual ELF and signed APK alignment, executes direct and unchanged frontend calls, and removes only its own test app. Real 4 KB alignment, API 26, wrong SONAME, wrong-machine and unbundled-dependency libraries must fail validation without replacing the last export. Evidence is written to `target/export-android/report.json`; only the named emulator architecture is claimed as executed.
