# [M1] Discover ordinary Tauri projects and registered commands

## Outcome

Export should begin with the existing Tauri application and actual registered commands, eliminating the mandatory bridge-specific Rust layout.

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
- Depends on: [#5 — [M0] Prove export from an unmodified Tauri project](https://github.com/gronxb/tauri-native/issues/5), [#6 — [M0] Define compatibility and source-integrity acceptance fixtures](https://github.com/gronxb/tauri-native/issues/6)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/003-project-command-discovery.md`
- Issue: [#7](https://github.com/gronxb/tauri-native/issues/7)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — implementation verified on 2026-09-06; merged in [PR #24](https://github.com/gronxb/tauri-native/pull/24), commit `83196b9`.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Execution result

Read-only `inspect` now uses Cargo metadata plus the shipped Rust parser. Both default exporters use the same discovered model and generated workspace; the application-owned core/header path is explicit legacy only. Tests cover ordinary dependency ranges, custom library names/paths, workspace members, build-hook objects, deterministic JSON, the complete rejection corpus, multiple diagnostics and runtime helpers. Producer hashes remain unchanged. Modules/cfg registration, custom initialization/build scripts and unsupported configuration remain explicit diagnostics.

Validation: CLI tests (18), CLI/host package checks and typechecks, both host example typechecks, Rust legacy core tests (8), macOS native contract, iOS Simulator Swift typechecks and Android arm64 JNI compilation pass. Evidence: ignored `target/export-contract/report.json`. The CLI also built the ordinary fixture into an iOS XCFramework without source changes. Relocation manifests, atomic publication, platform runtime execution and independent host packaging remain #9–#12 gates.

## Current state and evidence

- [`packages/cli/src/commands/export-ios.ts:67`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-ios.ts#L67): Defaults to the bridge-specific app-core.
- [`packages/cli/src/commands/export-android.ts:63`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-android.ts#L63): Android uses the same assumption.
- [`packages/cli/src/utils/cargo-manifest.ts:3`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/utils/cargo-manifest.ts#L3): Current library-name extraction uses regular expressions.

Representative current source:

```
const libSection = source.match(/\[lib\]([\s\S]*?)(?=\n\[|$)/)?.[1];
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/commands/export-ios.ts packages/cli/src/commands/export-android.ts packages/cli/src/utils/cargo-manifest.ts` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/cli.ts
- packages/cli/src/commands/
- packages/cli/src/utils/cargo-manifest.ts
- packages/cli/src/discovery/ (new if required by M0)
- packages/cli/test/
- packages/cli/package.json
- packages/cli/README.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Use the M0-selected mechanism, Cargo metadata and resolved configuration where appropriate. Resolve project/workspace roots, features/targets, actual registration and frontend build/dist inputs for the documented subset.

2. Produce one command model for native adapters and later type generation. Export only registered eligible commands; reject ambiguous/unsupported registration with locations rather than guessing or exposing all annotated functions.

3. Default export to the ordinary application manifest. Keep explicit custom-core/header input only as optional legacy/advanced compatibility if necessary, never the main setup path.

4. Add a read-only inspect command with human/JSON output. Any optional selection flags must resolve ambiguity without requiring source restructuring, new producer macros, or startup execution.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Discovery/CLI/package tests pass. |
| Existing baseline | `nub --cwd packages/cli run typecheck` | Exit 0. |
| Gate from M0 | `nub --cwd packages/cli run test:export:contract` | Registration and source-integrity expectations pass. |

## Meaningful test scenarios

- Scaffold/workspace, command modules, lib names, paths with spaces and supported cfg/features.
- Unregistered functions are absent; ambiguous registrations fail.
- Config formats/build-hook forms are supported correctly or rejected before compilation.
- inspect does not build/mutate and JSON output is deterministic.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Ordinary fixture is discovered without app-core/header arguments.
- [x] Diagnostics explain every unsupported command.
- [x] Both exporters share the discovered command model.
- [x] No authored producer file changes.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If registration resolution needs semantic guessing or application startup, report an unsupported case rather than inventing a command set.

Support an explicit bounded Rust/Tauri subset initially; arbitrary macro expansion is not an implicit first-release requirement.

Use a `codex/project-command-discovery` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
