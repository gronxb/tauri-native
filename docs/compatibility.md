# Export compatibility contract v1

This is the versioned acceptance contract for source-transparent export, established by [M0](adr/0004-source-transparent-export-spike.md). The source implementation now uses ordinary project discovery and tool-owned adapter generation by default. The previously published 0.1.0 release used the legacy core/header route.

The producer remains an ordinary Tauri application. Install the CLI, export, and hand the resulting platform directory to a host. The CLI owns generated Rust adaptation and the ABI. The host owns its application lifecycle. Export must not start the producer's `run()` or create a second application event loop.

## Verified versions and execution boundary

| Component | Pinned acceptance environment |
| --- | --- |
| Rust | 1.97.1, edition 2021 fixture |
| Tauri / tauri-build | 2.11.5 / 2.6.3 |
| `@tauri-apps/api` / CLI | 2.11.1 / 2.11.4 |
| Serde / serde_json | 1.0.229 / 1.0.151 |
| Fixture frontend | Vite 8.2.2 |
| Native execution | macOS arm64, Swift C ABI consumer and actual WKWebView |
| Desktop parity | Original desktop binary builds; separate test copy uses Tauri's real command macros and test IPC |

Other versions and mobile execution need their own evidence. MockRuntime is used only for the desktop IPC baseline, never the exported adapter. There is no general window, state, plugin, capability, event or runtime compatibility claim.

## Normative command and frontend behavior

The [ordinary fixture](../packages/cli/test/fixtures/standard-tauri/) has a single default Builder chain, one literal root command registry, and synchronous private Rust functions. Only registered functions are callable. All inputs and outputs remain serialized by the producer's actual serde implementation.

| Supported fixture case | Required behavior |
| --- | --- |
| `describe` success | Camel-case struct fields, arrays and Unicode survive the native boundary. |
| `describe` domain error | `Result::Err` rejects `invoke` with the original tagged error object, including when Result is imported under another name. |
| `greet` argument names | Rust `display_name` receives JSON `displayName`. |
| `greet` invalid number / explicit null | Reject with the same invalid-argument error as the Tauri handler. |
| `greet` missing key | Reject with Tauri's missing-required-key error; absence is distinct from explicit null. |
| `optional` absent / null / string | Return null / null / the string, respectively. |
| `nothing` unit result | Resolve the frontend promise with null. |
| `select` enum | Preserve adjacent tagging, renamed variants and newtype data; reject an unknown variant. |
| Annotated `unregistered` | Reject without exposing the function. An annotation alone is insufficient authorization. |

The unchanged frontend imports `invoke` from `@tauri-apps/api/core`. It has no host detection, bridge SDK or transport envelope. The host shim resolves with a success value or rejects with an error; `{ok, value, error}` is private transport data. A promise resolving to an error envelope violates this contract.

The test checks ABI version 1, compares fourteen native requests with the original Tauri handler after removing the internal protocol version field, and verifies matching frees across 10,000 additional responses and executes the ordinary frontend through WKWebView. These examples establish the stated subset, not arbitrary macro expansion, custom serializers, transitive runtime helpers or Cargo dependency initialization.

## Explicit rejection corpus

Each directory in [the compatibility corpus](../packages/cli/test/fixtures/compatibility/cases.json) overlays the pinned ordinary scaffold. Every negative fixture must pass an ordinary `cargo check --lib --locked --offline` before its export diagnostic is accepted. Rejection is checked twice, with no output publication or authored-file changes.

| Fixture | Current outcome |
| --- | --- |
| `async` | Async scheduling and lifetime semantics are pending M3. |
| `module` | External module registration is pending module/privacy-aware discovery. |
| `command-options` | Command-level argument renaming requires explicit discovery support. |
| `conditional` | Feature-gated registration requires resolved configuration. The fixture enables its ordinary `greeting` feature. |
| `command-cfg` | Conditional command attributes require explicit resolution. |
| `state`, `app-handle`, `window` | Injected runtime objects cannot be silently fabricated. |
| `plugin`, `initialization`, `custom-context` | Application setup cannot be silently dropped. |
| `alias`, `item-macro` | Alias/macro resolution is outside the M0 analyzer. |
| `borrowed` | Borrowed arguments require a separately verified lifetime contract. |

These are supported **diagnostics**, not execution support for the rejected APIs. Adding a capability requires changing its fixture expectation and proving native/desktop behavior, not merely removing a rejection. Configuration forms, ACLs, dependency graphs and source shapes outside this corpus remain unverified; production discovery must reject ambiguity before publishing an artifact.

## Authored-file change budget

- CLI installation/removal may change `package.json` and its JavaScript lockfile.
- Export may write disposable generated workspace, cache and artifact directories. Their locations must be explicit and separate from authored files.
- Export must preserve all authored Rust/frontend files, Cargo manifests and lockfiles, command registration, Tauri configuration, assets and ordinary build scripts.
- Deleting generated output must not break the desktop app. Re-export must reconstruct it without maintained bridge source.
- A failed export must also preserve authored files and must not leave an apparently successful partial artifact.

The gate takes SHA-256 snapshots and stages an isolated fixture in Git to check `git diff --exit-code`. Both checks are required: hashes catch new/untracked files, while Git makes tracked changes visible. Known fixture output roots are excluded explicitly; arbitrary directory names such as `src/gen` remain authored content. The integrity probe detects edits, deletion and added source. Tests remove their temporary producer copies in `finally` and check the checked-in corpus again.

## Reproduce and extend

Follow the [native harness prerequisites](../packages/cli/test/native-export/README.md), then run:

```sh
nub --cwd packages/cli run test:export:contract
nub --cwd packages/cli run test
```

Successful evidence is written to ignored `target/export-contract/report.json`, including tool versions, native and frontend results, desktop parity, every rejection and source hashes. A new run removes the previous success report. Missing toolchains fail the gate rather than skipping it.

The gate now executes the production discovery/workspace adapter. Later milestones add platform/host and copied-artifact evidence. The support table must always distinguish demonstrated behavior, explicit rejection and unverified combinations. [ADR 0004](adr/0004-source-transparent-export-spike.md) supersedes the mandatory producer-owned core/header direction in ADR 0001 while preserving its single-owner lifecycle boundary.

## M1 discovery and ABI extension

`inspect` uses read-only Cargo metadata, preserves ordinary dependency ranges and checks the resolved Tauri lockfile version. Tests cover workspace members, custom library names/paths, object build hooks, deterministic JSON, all rejection fixtures, multiple command diagnostics and runtime helpers. The tool preserves original Rust source line positions in its generated copy. Native crate types are generated even when the ordinary fixture has only a plain library target.

Generated builds remove the standard Tauri application build/runtime dependency in the disposable copy and reject domain dependencies that would retain Tauri runtime ownership. Custom build scripts, target-specific Tauri dependencies, configuration overlays, application ACLs and external workspace paths are explicitly unsupported. The Rust parser is shipped in the CLI package and compiled in its own temporary cache; inspection never builds or starts the application.

ABI v1 has an explicit version function and an internal versioned response frame. React Native and Lynx unwrap it for the unchanged Tauri frontend; the explicit legacy route keeps its prior envelope. The contract compiles both actual Objective-C++ host bridges on macOS and proves version mismatch rejection before invocation, UTF-8 handling and rejection of embedded NUL command names. Platform compilation and packaged mobile execution have separate gates.

The native gate also changes only the existing `generate_handler!` registry and confirms the newly registered command executes through native and frontend calls. A separate Rust type error proves that failed compilation preserves producer hashes and the original error line.
