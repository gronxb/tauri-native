# [M0] Define compatibility and source-integrity acceptance fixtures

## Outcome

A bridge-tailored example does not prove that an ordinary Tauri app stays unaware of this project. Establish reusable fixtures and a precise support contract for all subsequent work.

## Product contract

The Tauri project should know as little as possible about tauri-native. The intended workflow is **install the CLI → export native artifacts → move/copy them → integrate in the host**. Integration belongs in the CLI and host package.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M0 — Prove source-transparent Tauri export](https://github.com/gronxb/tauri-native/milestone/1)
- Priority: **P1** · Effort: **M** · Implementation risk: **MED**
- Category: direction
- Depends on: [#5 — [M0] Prove export from an unmodified Tauri project](https://github.com/gronxb/tauri-native/issues/5)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/002-compatibility-source-integrity.md`
- Issue: [#6](https://github.com/gronxb/tauri-native/issues/6)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: TODO.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`examples/tauri/src/main.ts:12`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src/main.ts#L12): The current demo reads a custom __TAURI_NATIVE_HOST__ global.
- [`docs/adr/0001-ios-runtime-boundary.md:47`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/docs/adr/0001-ios-runtime-boundary.md#L47): The current seam supports invoke, not general plugins/events/capabilities.
- [`examples/tauri/src-tauri/src/lib.rs:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/src/lib.rs#L1): The demo uses a custom response envelope.

Representative current source:

```
const hostType = window.__TAURI_NATIVE_HOST__ ?? 'desktop';
```

Before implementation, inspect `git diff 117e887..HEAD -- examples/tauri/src/main.ts docs/adr/0001-ios-runtime-boundary.md examples/tauri/src-tauri/src/lib.rs` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/test/fixtures/
- packages/cli/test/native-export/
- packages/cli/package.json
- docs/compatibility.md (new)
- docs/adr/
- README.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Create pinned positive/negative fixtures for a scaffold, command modules, serde naming/enums, sync/async signatures, unregistered commands, and runtime-dependent commands.

2. Define the authored-file change budget: CLI installation/removal may edit package.json and the JS lockfile; export must not edit authored Rust/frontend, Cargo manifests/lockfiles, command registration, or Tauri config. Ignored generated output/caches are separate. Check byte hashes as well as git diff.

3. Document supported Tauri/Rust/API versions and unsupported categories. Preserve ordinary invoke resolution/rejection and serialization behavior; internal wire envelopes must not leak into the Tauri-facing API.

4. Add test:export:contract and reuse it across milestones. Supersede conflicting PoC assumptions in an ADR while preserving their history. Keep host identification in host UI/test harness, not the ordinary producer fixture.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| New gate to add | `nub --cwd packages/cli run test:export:contract` | Positive/negative compatibility expectations and source-integrity hashes pass. |
| Existing baseline | `nub --cwd packages/cli run test` | CLI unit/package checks pass. |

## Meaningful test scenarios

- Successful, failed, repeated export and cleanup preserve authored files.
- Ordinary frontend needs no custom global/import.
- Result::Err, serde names and null behavior match desktop.
- Unsupported fixtures fail clearly without a falsely valid export.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [ ] Every documented supported/unsupported category has a fixture.
- [ ] The source-integrity gate covers success and failure.
- [ ] Normal Tauri frontend return/error behavior is normative.
- [ ] The contract makes no blanket runtime/plugin compatibility claim.
- [ ] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [ ] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Do not redefine fixtures to accept source intrusion that the feasibility decision did not approve.

Users may naturally have Rust crates and domain initialization; our particular crate layout or runtime API must not become mandatory.

Use a `codex/compatibility-source-integrity` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
