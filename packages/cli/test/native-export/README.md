# Source-transparent export spike

This opt-in M0 experiment verifies [issue #5](https://github.com/gronxb/tauri-native/issues/5). It does **not** change the published `tauri-native export` commands.

## Run

Prerequisites: macOS with Xcode/Swift, a working Rust toolchain on `PATH`, and the repository's installed JS dependencies (`nub ci`). The checked-in fixture pins Tauri 2.11.5, `@tauri-apps/api` 2.11.1, and Vite 8.2.2. Cargo runs offline and locked, so the two fixture/generator lockfiles' dependencies must already be available. On a fresh machine, fetch them first:

```sh
cargo fetch --locked --manifest-path packages/cli/test/native-export/generator/Cargo.toml
cargo fetch --locked --manifest-path packages/cli/test/fixtures/standard-tauri/src-tauri/Cargo.toml
nub --cwd packages/cli run test:export:spike
nub --cwd packages/cli run test:export:contract
```

The runner fails on missing prerequisites; it does not skip native checks. It uses the installed Tauri example JS dependencies to build a temporary copy of the ordinary fixture and verifies the pinned versions first. This is a repository-level experiment, not the later independent-package-consumer test.

Successful evidence is written to ignored `target/export-spike/report.json`, with source hashes, versions, native/frontend values, desktop IPC parity, and blocked probe names. The generated `.dylib` and Swift consumer are retained there. Temporary producer/build copies are removed. A failed run removes the previous success report before starting.

## What actually runs

1. Hash the ordinary producer's authored files, including Cargo manifests/lockfile, frontend, and Tauri config.
2. Build its unchanged frontend with Vite. The frontend imports only `@tauri-apps/api/core`.
3. Use `syn` to read its one ordinary `run()` / `generate_handler!` registration and generate a temporary `lib.rs`. Only registered root commands get ABI dispatch; the producer owns no dispatcher/header.
4. Delete the entire generated copy, regenerate it, and check deterministic generated source.
5. The contract runner additionally checks the complete negative fixture corpus for unsupported source forms. These are **diagnostic** checks, not native implementations of those capabilities.
6. Compile the generated native library and load it through a small Swift C ABI consumer. Run its frontend in a real `WKWebView` with a tool-owned invoke shim; the shim unwraps transport envelopes into ordinary Tauri promise values/rejections.
7. Build the original desktop application without changing its source.
8. Compile a separate public-API experiment: calling the private ordinary command produces Rust E0603, and accessing `InvokeMessage::new` produces E0624.
9. In a separate test-only copy, run the same requests through Tauri's real command macros and IPC with `tauri::test::MockRuntime`. Compare responses exactly to the generated ABI. MockRuntime is never part of the exported adapter.
10. Assert that producer/fixture hashes still match.

The scenarios cover a serde-renamed structured input/output, a tagged domain error, Unicode, default camelCase argument names, invalid/missing/null arguments, optional and unit results, adjacent-tagged enums, and an annotated but unregistered command.

`test:export:contract` also compiles the fourteen complete negative fixture overlays as ordinary Tauri applications, checks their repeated export rejection, and verifies Git/byte-hash integrity. Its versioned support matrix and authored-file budget are in [the compatibility contract](../../../../docs/compatibility.md). It retains aggregate evidence in `target/export-contract/report.json`.

## Boundaries

This proves the feasibility of generated adaptation for the demonstrated synchronous root commands in an ordinary scaffold. It is not a production Rust program analyzer and does not establish compatibility for arbitrary transitive helpers, serializers, macros, workspaces, configuration, or runtime initialization. It deliberately leaves general discovery and compatibility classification to the following roadmap issues.

The native/frontend execution proof is on **macOS**. The ordinary desktop binary is built; the automated Tauri IPC comparison uses MockRuntime rather than driving that binary's visible window. No iOS/Android artifact or device claim follows from this result. The later platform milestones remain required.

See [ADR 0004](../../../../docs/adr/0004-source-transparent-export-spike.md) for the approach comparison, decision, and remaining gates.
