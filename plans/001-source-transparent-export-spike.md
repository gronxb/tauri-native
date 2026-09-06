# [M0] Prove export from an unmodified Tauri project

## Outcome

The current exporter requires a custom app-core crate, JSON dispatcher, and C ABI. Prove that the CLI can own adaptation of existing registered commands before building the rest of the roadmap.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M0 — Prove source-transparent Tauri export](https://github.com/gronxb/tauri-native/milestone/1)
- Priority: **P1** · Effort: **L** · Implementation risk: **HIGH**
- Category: direction
- Depends on: none
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/001-source-transparent-export-spike.md`
- Issue: [#5](https://github.com/gronxb/tauri-native/issues/5)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — implemented and verified on 2026-09-06. [PR #22](https://github.com/gronxb/tauri-native/pull/22) merged into `main` as `bb1c3f1`; #5 is closed.

## Execution result

**Scoped go:** the ordinary fixture's synchronous root commands execute through a generated native `.dylib` and an unchanged frontend in a real macOS WKWebView. Values/errors match Tauri's original command-handler IPC. The original desktop app builds and all authored producer hashes remain unchanged. Ten unsupported-form diagnostic probes reject without writing output.

- Decision and limits: [ADR 0004](../docs/adr/0004-source-transparent-export-spike.md).
- Reproduction: `nub --cwd packages/cli run test:export:spike` ([prerequisites](../packages/cli/test/native-export/README.md)).
- Local evidence: `target/export-spike/report.json` (ignored generated artifact).
- Existing gates passed: CLI tests (9), package verification, CLI typecheck, Rust core tests (8), and `git diff --check`.
- This proves a macOS feasibility slice. No public export behavior, iOS/Android artifact support, general discovery, async/state/plugin support, or production compatibility claim was added.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/cli/src/commands/export-ios.ts:67`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-ios.ts#L67): Default export requires crates/app-core/Cargo.toml and a user header.
- [`examples/tauri/src-tauri/src/lib.rs:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/src/lib.rs#L1): The Tauri adapter explicitly delegates to tauri_native_example_core.
- [`docs/adr/0001-ios-runtime-boundary.md:30`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/docs/adr/0001-ios-runtime-boundary.md#L30): The host must remain the sole lifecycle owner.

Representative current source:

```
const manifest = options.manifest
  ? path.resolve(workingDirectory, options.manifest)
  : path.join(tauriDirectory, 'crates/app-core/Cargo.toml');
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/commands/export-ios.ts examples/tauri/src-tauri/src/lib.rs docs/adr/0001-ios-runtime-boundary.md` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- docs/adr/
- packages/cli/src/ (isolated prototype only)
- packages/cli/test/fixtures/standard-tauri/ (new)
- packages/cli/test/native-export/ (new)
- packages/cli/package.json

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Create a pinned ordinary Tauri fixture with directly registered commands and no custom core/header/macros/host-detection code. Hash authored Rust, frontend, Cargo, and Tauri config files before/after export.

2. Compare public-API reuse and a CLI-generated build workspace/source-adaptation approach. Do not assume private Rust functions or generate_handler! internals are a stable reusable interface; do not execute app run()/event-loop startup to discover commands. Disposable generated copies are allowed, author-maintained forks are not.

3. Prove a registered synchronous command and serializable Result success/error through a compiled native boundary and unchanged @tauri-apps/api/core.invoke frontend. Probe async, modules, serde/cfg/features, State initialization, AppHandle/WebviewWindow, and plugins; classify supported/conditional/blocked with compiler/runtime evidence.

4. Record the selected architecture, exact reproduction commands, versions, source hashes, and a go/no-go ADR. Add test:export:spike. A no-go must block dependent implementation rather than quietly reverting to manual app-core extraction.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Implemented gate | `nub --cwd packages/cli run test:export:spike` | Native command/result parity and unchanged authored-source hashes; failed feasibility is recorded honestly. |
| Existing baseline | `nub --cwd packages/cli run typecheck` | Exit 0. |

## Meaningful test scenarios

- Custom serializable inputs/results and Result::Err parity.
- An annotated but unregistered command is not exposed.
- Runtime/plugin-dependent command receives an explicit compatibility outcome.
- Deleting generated intermediates and repeating still works; the original desktop fixture remains buildable.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] A reproducible go/no-go decision exists.
- [x] A go includes native proof with no producer integration code and no second app runtime.
- [x] Initialization/state and unsupported command categories are explicitly covered.
- [x] A no-go leaves M1+ blocked pending a maintainer decision, not a weakened success claim (the decision records this rule; the observed outcome is a scoped go).
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If both source transparency and single-owner lifecycle cannot be preserved, report the smallest required concession. Do not promise arbitrary command compatibility.

Research gate, not a preselected macro fork or runtime replacement. References: https://v2.tauri.app/develop/calling-rust/ and https://docs.rs/tauri/2.11.5/tauri/macro.generate_handler.html (generated macro output is internal).

Use a `codex/source-transparent-export-spike` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
