# [M4] Diagnose toolchains, unsupported projects, and artifact mismatches

## Outcome

Export often finds problems during expensive builds, while host checks mostly verify existence. Read-only diagnostics should explain project/toolchain and copied-artifact failures early.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M4 — Short and diagnosable development workflow](https://github.com/gronxb/tauri-native/milestone/5)
- Priority: **P2** · Effort: **M** · Implementation risk: **LOW**
- Category: direction
- Depends on: [#7 — [M1] Discover ordinary Tauri projects and registered commands](https://github.com/gronxb/tauri-native/issues/7), [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9), [#10 — [M1] Export equivalent portable Android libraries and assets](https://github.com/gronxb/tauri-native/issues/10), [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/012-doctor-artifact-diagnostics.md`
- Issue: [#16](https://github.com/gronxb/tauri-native/issues/16)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — [PR #33](https://github.com/gronxb/tauri-native/pull/33) merged into main.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/cli/src/cli.ts:15`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/cli.ts#L15): Only export commands exist.
- [`packages/cli/src/commands/export-android.ts:107`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-android.ts#L107): Target setup/build occurs during export.
- [`packages/react-native/app.plugin.js:93`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/app.plugin.js#L93): Current artifact checks are existence based.

Representative current source:

```
statSync(path.join(exportDirectory, artifact));
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/cli.ts packages/cli/src/commands/export-android.ts packages/react-native/app.plugin.js` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/cli.ts
- packages/cli/src/commands/doctor.ts (new)
- packages/cli/src/discovery/ and artifacts/ diagnostics
- packages/cli/test/
- packages/cli/package.json
- packages/react-native/app.plugin.js
- packages/react-native/test/
- CLI/host docs

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Add doctor for source projects and copied artifacts: toolchain/target checks, configuration/command compatibility, manifest/ABI/version and content integrity.

2. Only source mode may compare source fingerprints to exports. Artifact-only mode must work without source and must not pretend to detect edits in an unavailable producer checkout.

3. Share diagnostic codes with export/install, provide human/JSON output and meaningful nonzero exit statuses, and perform checks before expensive builds/destructive copying.

4. Keep doctor read-only: no source edits, automatic installations/repairs or secret dumps. Add test:doctor covering actual documented failure cases.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | CLI diagnostics/package checks pass. |
| Existing baseline | `nub --cwd packages/react-native run test` | Host diagnostics/package checks pass. |
| New gate to add | `nub --cwd packages/cli run test:doctor` | Expected exit codes/diagnostics with no mutation. |

## Meaningful test scenarios

- Missing NDK/compiler/target, incompatible API/ABI and corrupt member are distinguishable.
- Relocated artifact validates without source.
- Staleness is claimed only with source evidence.
- Narrow/non-TTY output and spaced paths preserve machine-readable diagnostics.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Both producer and artifact-only consumer have useful diagnostic flows.
- [x] Failures happen before destructive copy/compilation.
- [x] JSON is stable and checks do not mutate/install.
- [x] Staleness claims match observable evidence.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Do not require source access for copied-artifact validation or turn doctor into an installer.

The prior review observed root-directory CLI assertions sensitive to wrapped paths; test diagnostic semantics separately from terminal formatting while touching this code.

Use a `codex/doctor-artifact-diagnostics` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Implementation evidence — 2026-09-07

- Added producer and artifact-only `doctor`, schema-versioned JSON, stable failure codes and evidence-limited source comparison. The shared Node reader ships in both host packages and is bundled in the CLI; Expo preserves its codes before copying.
- Source checks use the actual Rust inspector with automatic toolchain installation disabled and Cargo offline. A cold inspector cache produces a preparation diagnostic without compiling. Export shares tool preflight before frontend hooks; its existing Rust-target installation behavior remains explicit.
- `test:doctor`: 8 passing scenarios cover relocation without tools, corrupt/missing/incompatible members, tool/target/NDK/compiler failures, secret stderr suppression, unsupported source locations, cold-cache preservation, source/built-frontend changes, preflight output preservation and packed CLI/SDK consumption outside the checkout.
- CLI, RN and Lynx typechecks/package verification pass; CLI package suite 41 tests, RN 9, Lynx 2. Actual producer doctor passes both platforms on the configured Mac; artifact-only doctor passes with Rust absent from PATH.
- `test:events:export` passes using the installed packed CLI: actual ordinary Tauri desktop frontend, all three iOS and four Android architectures, complete native validation, unchanged producer Git diff and frontend bytes, then producer deletion. Evidence: `target/view-events/export-report.json`.
- No host-native implementation changed. The four host view and four async Release flows recorded for #15 remain the native lifecycle evidence; this issue does not claim new device or independent-adopter execution.
