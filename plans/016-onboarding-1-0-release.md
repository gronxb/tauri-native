# [M5] Validate independent onboarding and prepare the 1.0 release

## Outcome

The final gate is evidence that developers can install the CLI, export/move artifacts and integrate while their producer stays ordinary. Working on the author's machine is insufficient.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M5 — Validate adoption and ship 1.0](https://github.com/gronxb/tauri-native/milestone/6)
- Priority: **P1** · Effort: **M** · Implementation risk: **MED**
- Category: direction
- Depends on: [#18 — [M5] Demonstrate a useful Tauri feature in independent mobile hosts](https://github.com/gronxb/tauri-native/issues/18), [#19 — [M5] Gate changes with native, compatibility, and package verification](https://github.com/gronxb/tauri-native/issues/19)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/016-onboarding-1-0-release.md`
- Issue: [#20](https://github.com/gronxb/tauri-native/issues/20)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: IN PROGRESS — candidate versioning, migration and onboarding records are prepared; independent evaluator and physical-device evidence remain open.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`README.md:5`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/README.md#L5): Project is explicitly a PoC.
- [`packages/cli/package.json:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/package.json#L1): Packages target the experimental dist-tag.
- [`scripts/release.mjs:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/scripts/release.mjs#L1): Publication already has a dedicated script.

Representative current source:

```
This is a proof-of-concept (PoC) project currently under development.
```

Before implementation, inspect `git diff 117e887..HEAD -- README.md packages/cli/package.json scripts/release.mjs` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- README.md
- packages/cli/README.md
- packages/react-native/README.md
- packages/lynx/README.md
- docs/compatibility.md
- docs/adoption.md (new)
- docs/validation.md
- .changeset/
- manifests/release workflow only as needed for the approved candidate

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Write the canonical quickstart: producer CLI install → export → move artifacts → host package/config → build. Legacy custom-core integration is explicitly optional.

2. Arrange 2–3 independent evaluators with ordinary Tauri projects through maintainer-authorized outreach. Record setup versions, producer diffs, supported/blocked commands, time/steps and failures. This ticket does not authorize an agent to contact anyone.

3. Complete at least two independent artifact-only walkthroughs from docs alone. Route blockers back to the responsible milestone; publish support/migration guidance and measured overhead/limitations.

4. Prepare a reviewable 1.0 candidate, versioning/changelogs/release notes. Stable publication follows the maintainer's release authorization/process only after all required gates pass. Do not invent due dates or guaranteed compatibility.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baselines | `nub --cwd packages/cli run test && nub --cwd packages/react-native run test && nub --cwd packages/lynx run test` | Candidate packages verify. |
| Gate from reference feature | `nub --cwd packages/cli run test:external-consumer` | Candidate package/artifact combination integrates externally. |
| Adoption evidence | Attach evaluator walkthroughs/source-diff summaries and CI/device run URLs. | At least two independent integrations satisfy the source/artifact contracts; otherwise keep gate open. |

## Meaningful test scenarios

- Quickstart uses real commands/options from tested candidate packages.
- Removing CLI/generated output leaves the ordinary Tauri app runnable.
- Producer diff remains within install/export change budget.
- A consumer reproduces the supported combination using copied artifacts only.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [ ] At least two evidenced independent integrations need no bridge-specific producer code.
- [ ] Required native/compatibility/package checks pass for the RC.
- [ ] Unsupported APIs and migration from PoC are documented.
- [ ] A reviewable 1.0 candidate exists; stable publication uses the authorized release process.
- [ ] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [ ] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If adoption needs manual core extraction, custom annotations, source access in hosts or silent fallbacks, remain experimental and reopen the failed gate.

Do not invent user quotes, metrics, dates or market demand. Stars/downloads do not replace successful integrations.

Use a `codex/onboarding-1-0-release` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
