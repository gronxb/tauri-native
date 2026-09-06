# [M4] Refresh exports with correct caching and a watch workflow

## Outcome

Developers currently repeat frontend build, native export and host integration manually. Shorten that loop while retaining exported artifacts as the producer/host boundary.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M4 — Short and diagnosable development workflow](https://github.com/gronxb/tauri-native/milestone/5)
- Priority: **P2** · Effort: **L** · Implementation risk: **MED**
- Category: direction
- Depends on: [#16 — [M4] Diagnose toolchains, unsupported projects, and artifact mismatches](https://github.com/gronxb/tauri-native/issues/16)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/013-incremental-export-watch.md`
- Issue: [#17](https://github.com/gronxb/tauri-native/issues/17)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — [PR #34](https://github.com/gronxb/tauri-native/pull/34) merged into main.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/cli/src/commands/export-ios.ts:89`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-ios.ts#L89): Runs the frontend build hook during export.
- [`packages/cli/src/commands/export-android.ts:107`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-android.ts#L107): Recreates intermediate output and invokes native builds.
- [`packages/cli/src/cli.ts:15`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/cli.ts#L15): No watch/development workflow exists.

Representative current source:

```
rmSync(cargoOutput, { recursive: true, force: true });
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/commands/export-ios.ts packages/cli/src/commands/export-android.ts packages/cli/src/cli.ts` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/cli.ts
- packages/cli/src/commands/ export/watch paths
- packages/cli/src/artifacts/ fingerprints/staging
- packages/cli/test/
- packages/cli/package.json
- CLI/host docs

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Define minimal cache inputs: actual source, Cargo lock/config/features/target, frontend inputs, CLI/ABI version. Reuse Cargo incremental compilation; do not add a distributed cache service.

2. Add opt-in watch export with debounce, one build per output, generated-directory exclusion and atomic successful promotion. Skip appropriate expensive steps when inputs do not change.

3. Differentiate frontend/native edits and report accurate host actions. Packaged-asset changes may require copy/rebuild/reinstall; do not advertise automatic HMR that the host cannot perform.

4. Keep any host copying explicitly configured on the host/CLI side. Add test:watch. Defer embedded dev servers, arbitrary remote loading, OTA and live native-code replacement.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Cache/watch/package tests pass. |
| New gate to add | `nub --cwd packages/cli run test:watch` | Real temp edits exercise invalidation, recovery and promotion. |
| Platform gates from M1 | `nub --cwd packages/cli run test:export:ios && nub --cwd packages/cli run test:export:android` | Incremental outputs still execute on configured native toolchains. |

## Meaningful test scenarios

- No-change, frontend, Rust, Cargo.lock, feature/target and CLI protocol changes invalidate correct components.
- Failed rebuild preserves old output and recovers on the next valid edit.
- Generated output never triggers a loop; concurrent edits cannot publish mixed artifacts.
- Changed Rust behavior reaches the host after documented refresh/install steps.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Repeatable documented watch flow needs no producer integration code.
- [x] Cache validity is tested against real behavior, not only timestamps.
- [x] Failures preserve known-good output.
- [x] Docs distinguish artifact refresh from host rebuild/install.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If faster reload needs production origin-policy changes or an OTA service, defer it instead of expanding scope.

Measure before/after times on the same fixture/toolchain; correct invalidation comes before headline speed.

Use a `codex/incremental-export-watch` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Implementation evidence — 2026-09-07

- Added opt-in `--incremental`, `--watch` and `--force`. Result reuse validates the complete artifact and hashes file/dependency contents, Cargo configuration/features, environment, platform/tool identity and CLI/ABI implementation. Receipt provenance is not reused as an incremental cache key.
- Captured producer discovery, generation and frontend hooks use the same disposable snapshot. Persistent adapter synchronization retains unchanged file timestamps for Cargo. Output locks serialize writers; Cargo products are isolated per output directory. Typed `commands.ts` exports can be replaced normally.
- CLI typecheck, 46 tests and package checks pass. Focused scenarios cover content changes despite preserved mtimes, linked dependencies, inherited caller Cargo configuration, generated-directory exclusion, synchronization, competing writers and edits immediately after source capture.
- `test:watch` passes with an installed packed CLI and actual iOS/Android builds. It verifies no-change/force, frontend/Rust/lock/default-feature/CLI/protocol/platform invalidation, debounce, generated-output exclusion, failure recovery, in-flight source changes and graceful stop. Two concurrent outputs compile different environment values and every native slice contains only its intended value.
- `test:export:ios` and `test:export:android` pass on the final implementation. All three iOS/four Android architectures are compiled/inspected. Relocated artifacts execute an edited Rust response after the producer is removed and the independent host is rebuilt without Rust. Runtime evidence is arm64 iOS Simulator 26.4.1 and Android API 37 with 16 KB pages; the signed Android APK also passes ZIP alignment.
- Evidence: `target/incremental-export/report.json`, `target/export-ios/report.json`, `target/export-android/report.json`; reproducible commands, measured timings, cache limitations and host rebuild/install steps are in `docs/development-loop.md`.
- Cache reuse is opt-in for reproducible builds within the documented input boundary. Physical devices, host HMR, OTA and independent-adopter evidence are not claimed by this issue.
