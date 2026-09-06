# [M1] Generate the native command adapter and own the C ABI

## Outcome

Application authors should not maintain invoke_json, a second allowlist, C allocation/free functions, or a header. Generate that machinery while preserving ordinary command behavior.

## Product contract

The Tauri project should know as little as possible about tauri-native. The intended workflow is **install the CLI → export native artifacts → move/copy them → integrate in the host**. Integration belongs in the CLI and host package.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M1 — CLI-only portable native artifacts](https://github.com/gronxb/tauri-native/milestone/2)
- Priority: **P1** · Effort: **L** · Implementation risk: **HIGH**
- Category: direction
- Depends on: [#7 — [M1] Discover ordinary Tauri projects and registered commands](https://github.com/gronxb/tauri-native/issues/7)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/004-generated-native-adapter.md`
- Issue: [#8](https://github.com/gronxb/tauri-native/issues/8)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — implementation verified on 2026-09-06; merged in [PR #24](https://github.com/gronxb/tauri-native/pull/24), commit `83196b9`.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Execution result

The CLI owns native crate types, dispatcher, header and versioned ABI. Generated copies preserve source line positions. Rust selects semantic Result behavior, including an imported Result alias. The contract executes fourteen native/Tauri-handler comparisons, the unchanged frontend, a changed registration, a compiler failure with original line mapping, and 10,022 responses with matching frees. Actual RN/Lynx Objective-C++ bridges reject incompatible ABI before invocation and handle UTF-8/NUL commands. All four WebView shims preserve values/errors; legacy examples select the prior ABI explicitly.

Validation: CLI tests (18), CLI/host package checks and typechecks, both host example typechecks, Rust legacy core tests (8), macOS native contract, iOS Simulator Swift typechecks and Android arm64 JNI compilation pass. Evidence: ignored `target/export-contract/report.json`. The CLI also built the ordinary fixture into an iOS XCFramework without source changes. Relocation manifests, atomic publication, platform runtime execution and independent host packaging remain #9–#12 gates.

## Current state and evidence

- [`examples/tauri/src-tauri/crates/app-core/src/lib.rs:224`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/crates/app-core/src/lib.rs#L224): Application-owned match dispatcher.
- [`examples/tauri/src-tauri/crates/app-core/src/lib.rs:263`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/crates/app-core/src/lib.rs#L263): Application exports the custom C ABI.
- [`packages/react-native/cpp/TauriNativeImpl.cpp:25`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/cpp/TauriNativeImpl.cpp#L25): The host directly consumes this ABI.

Representative current source:

```
pub extern "C" fn tauri_native_invoke(
    command: *const c_char,
    payload_json: *const c_char,
) -> *mut c_char
```

Before implementation, inspect `git diff 117e887..HEAD -- examples/tauri/src-tauri/crates/app-core/src/lib.rs examples/tauri/src-tauri/crates/app-core/src/lib.rs packages/react-native/cpp/TauriNativeImpl.cpp` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/adapter/ (new, M0-selected architecture)
- packages/cli/native/ (only if selected by M0)
- packages/cli/src/commands/
- packages/cli/test/
- packages/cli/package.json
- packages/react-native/ and packages/lynx/ native ABI consumers (required protocol adaptation only)
- docs/compatibility.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Generate disposable adapter/build inputs and header from the discovered model. Preserve command implementations and M0 initialization semantics; any copied/transformed code is regenerated tooling output, never an author-maintained fork.

2. Own allocation/free, transport failures, protocol versioning, dispatch and allowlist internally. Separate the wire envelope from application-facing Tauri values and promise rejection behavior.

3. Compile and execute the supported synchronous subset through a native consumer and packaged frontend. Plan protocol versioning for async extension without prematurely adding a general runtime.

4. Make ordinary export work without a producer header, crate-type edit, custom crate, dispatcher or tauri-native Rust dependency. Preserve the explicit legacy fixture until it can be cleanly replaced.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Generation/package tests pass. |
| Gate from M0 | `nub --cwd packages/cli run test:export:contract` | Native behavior and source hashes pass. |
| Existing baseline | `cargo test -p tauri-native-example-core --locked` | Legacy core tests pass while that example remains. |

## Meaningful test scenarios

- Command registration changes regenerate dispatch without another list.
- Unicode, custom serde values and domain errors match desktop.
- Repeated success/failure calls use exactly one matching free; instrument actual native execution.
- Generation/compile failure leaves source unchanged and identifies useful original locations.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Ordinary fixture executes without author-written bridge code.
- [x] Direct and WebView callers receive correct value/error semantics.
- [x] Generated intermediates can be removed and reproduced.
- [x] ABI versioning is explicit and consumers check it.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

A required source edit or second Tauri runtime is a feasibility-contract failure, not something to hide behind a setup command.

Reuse the discovered model for type generation later. Async scheduling is a later issue; preserve a clear internal transport boundary.

Use a `codex/generated-native-adapter` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
