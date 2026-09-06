# ADR 0004: Tool-owned source adaptation is feasible for a bounded command subset

- Status: accepted as the M0 feasibility result; not a production exporter contract
- Date: 2026-09-06
- Roadmap: [issue #5](https://github.com/gronxb/tauri-native/issues/5)
- Baseline: `117e887`

## Product constraint

An ordinary Tauri project should need only the CLI to export its native code and frontend for a host. It should not maintain our `app-core` layout, dispatcher, C ABI/header, Rust SDK/macros, or host-specific frontend imports. Generated adaptation belongs to the tool. The mobile host remains the sole application/lifecycle owner.

This supersedes the **mandatory application-owned core/header setup as a long-term product direction** in ADR 0001. It preserves that ADR's single-owner runtime decision. The current published exporter and its explicit core/header inputs are unchanged by this experiment.

## Alternatives and evidence

### Link the ordinary library and call its public API

This works only when the application already exposes appropriate ordinary Rust functions. A normal `#[tauri::command] fn greet(...)` is private. The experiment compiles a separate consumer that attempts to call it and confirms Rust error **E0603**. Making every producer command public would introduce a new producer requirement, so it cannot be the default solution.

The generated Tauri handler is also not a standalone command bus. In Tauri 2.11.5, `InvokeMessage` owns a WebView and managed state, and its constructor is `pub(crate)`; the separate consumer confirms **E0624** when trying to access it. Tauri explicitly identifies the macro output and `Invoke` structure as internal, unstable contracts. A test runtime can establish baseline IPC behavior, but substituting one into a production host would not establish real lifecycle/plugin compatibility.

References: [Tauri command documentation](https://v2.tauri.app/develop/calling-rust/), [generate_handler stability](https://docs.rs/tauri/2.11.5/tauri/macro.generate_handler.html), and the pinned `tauri-2.11.5/src/ipc/mod.rs` source (`Invoke` and `InvokeMessage`).

### Generate an isolated build copy

The selected experiment parses the ordinary source with `syn`, reads the existing `generate_handler!` command list, and creates a disposable build copy. Its root function bodies, domain data definitions, imports, dependencies and serde behavior remain ordinary Rust code. The generated copy removes the application `run()` entry point and command attributes, and appends tool-owned dispatch/C ABI functions beside the private command functions. Rust privacy no longer requires editing the producer.

The generator supports only the specific simple Builder chain and synchronous root-command forms covered by the fixture. It rejects the probed unsupported forms instead of inventing runtime/state initialization. This is not yet general command discovery, dependency slicing, source-map support, or a complete compiler-backed validator.

## Decision

**Go for the next compatibility/discovery iteration, scoped to the demonstrated ordinary synchronous command shapes.** The proof shows that application-authored bridge code is not inherently required. It does not prove that all Tauri projects can be exported or that the generated artifact already works on mobile.

Keep generated source disposable and reconstructible from the producer and tool version. Do not introduce a custom producer Rust SDK/template as the default way to make the experiment pass. If later work cannot preserve command behavior and lifecycle ownership for a requested capability, report the unsupported case or revisit the smallest required concession explicitly.

## Executed acceptance evidence

The reproducible command is:

```sh
nub --cwd packages/cli run test:export:spike
```

Prerequisites and first-run dependency fetch commands are in [the harness README](../../packages/cli/test/native-export/README.md). The tested environment uses Rust 1.97.1, Tauri 2.11.5, `@tauri-apps/api` 2.11.1, Vite 8.2.2, and Xcode's macOS Swift/WebKit toolchain.

| Scenario | Observed result |
| --- | --- |
| Private registered command with structured input | A compiled generated `.dylib` is callable from a Swift C ABI consumer. |
| Serde names and Unicode | `{displayName: "한글 🦀", values: [2, 3, 5]}` returns `{displayName: "한글 🦀", total: 10}`. |
| Domain `Result::Err` | Tagged `{kind: "empty_name", message: "A name is required"}` rejects the standard frontend invoke promise. |
| Ordinary frontend | Its unchanged `@tauri-apps/api/core.invoke` calls execute inside a real macOS `WKWebView`. |
| Default argument naming | Rust `display_name` accepts frontend `displayName`. |
| Invalid argument type | Native response exactly matches Tauri's own command-handler error. |
| Annotated but unregistered function | Both native and frontend calls reject it; attributes alone do not expand the allowlist. |
| Desktop preservation | The original desktop application builds without edits. A separate test copy compares all request responses using Tauri's real command macros and test IPC. |
| Reproducibility | Deleting the entire generated copy and recreating it produces identical generated source. |
| Producer integrity | Authored fixture and temporary producer file hashes remain unchanged, including manifest/lockfile/config/frontend. Failure probes preserve inputs and write no output. |

The generated transport uses an internal success/error envelope. The tool-owned frontend shim resolves with the value or rejects with the error; it does not impose that envelope on the Tauri application's public API.

## Compatibility probes and limits

| Category | Current result |
| --- | --- |
| Demonstrated root synchronous commands | Native/real-WebView execution and exact Tauri IPC parity pass. |
| Serde struct field renaming and tagged enum errors | Proven for the fixture through the original Rust serializers. |
| Async commands | Explicit diagnostic; scheduling/cancellation/lifetime implementation belongs to M3. |
| Command attribute options | Explicit diagnostic; not implemented merely to enlarge this feasibility spike. |
| Module command paths | Explicit diagnostic; module/privacy-aware adaptation remains M1 work. |
| Conditional registration/Cargo features | Conditional registration diagnostic; no general configuration/macro expansion claim. |
| State, AppHandle, WebviewWindow | Explicit signature diagnostic; no fabricated objects or state initialization. |
| Plugin or managed-state initialization | The nonstandard Builder chain is rejected. |
| Arbitrary transitive helpers, aliases, custom serializers/macros | Not proven; this prototype must not become a production compatibility validator unchanged. |
| iOS/Android libraries, XCFramework packaging and mobile hosts | Not exercised by M0; remain M1/M2 gates. |

The negative cases are generator **diagnostic** probes, not demonstrations that those capabilities execute natively. The desktop IPC baseline uses `tauri::test::MockRuntime` only in an isolated test build. No mock runtime or second Tauri application event loop is initialized in the exported ABI or Swift host.

## Consequences and next gates

1. [#6](https://github.com/gronxb/tauri-native/issues/6) must turn this evidence into normative fixtures and a bounded compatibility contract, including input/error cases beyond this fixture.
2. [#7](https://github.com/gronxb/tauri-native/issues/7) must resolve real project registration/configuration before generalizing this parser. Avoid semantic guesses and preserve registration/ACL intent.
3. [#8](https://github.com/gronxb/tauri-native/issues/8) must own the complete generated adapter/ABI, source diagnostics, and compatibility versioning.
4. iOS/Android native builds and copied-artifact host execution remain mandatory; a macOS `.dylib` is not evidence for an XCFramework/mobile release.
5. General async/state/plugin support remains conditional on new evidence. A no-go for one capability must not silently turn into a required producer SDK or core refactor.
