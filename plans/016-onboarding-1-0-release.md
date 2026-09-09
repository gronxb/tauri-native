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
- Status: IN PROGRESS — [PR #37](https://github.com/gronxb/tauri-native/pull/37) merged as `05cb528`; complete RC validation at `eb1fab8` passed. Independent evaluator and physical-device evidence remain open.

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
- [ ] Physical iOS and Android RC execution is recorded, including signing/distribution conditions.
- [x] Required native/compatibility/package checks pass for the RC.
- [x] Unsupported APIs and migration from PoC are documented.
- [x] A reviewable 1.0 candidate exists; stable publication uses the authorized release process.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If adoption needs manual core extraction, custom annotations, source access in hosts or silent fallbacks, remain experimental and reopen the failed gate.

Do not invent user quotes, metrics, dates or market demand. Stars/downloads do not replace successful integrations.

Use a `codex/onboarding-1-0-release` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Candidate acceptance and remaining gates

[PR #37](https://github.com/gronxb/tauri-native/pull/37) merged into main as `05cb528`, preparing matching 1.0.0-rc.0 packages, Changesets prerelease state, changelogs, migration guidance and the onboarding evidence template. The packages retain the experimental npm channel.

[Complete hosted validation at `eb1fab8`](https://github.com/gronxb/tauri-native/actions/runs/34111222423) passed the producer, iOS, Android and candidate jobs. Downloaded evidence verifies the exact commit, export archive, all three package hashes and embedded manifests. Both native receipts match those inputs; all 13 required JUnit scenarios per platform passed with no failures, errors or skips. Original and changed-Rust Fieldnotes, pending navigation, and RN/Lynx async/scoped-view lifetimes passed. Android also executed the copied standalone APK on API 36 x86_64 with 16 KB pages and completed fully minified Lynx acceptance. The final candidate contains the exact verified tarballs.

The installed CLI gate permitted only package.json and package-lock.json to change during installation. Both exports preserved the installed producer; removing the CLI and generated output left a successful ordinary desktop Release build with no remaining JavaScript diff. The three RC tarballs match the previously verified actual npm publication dry-runs for the explicit experimental channel and public access. These are automated maintainer checks, not independent evaluator records.

The [candidate release notes](https://github.com/gronxb/tauri-native/blob/015191221e72fd62ecf04dca46e71ce35e5f5e25/docs/releases/1.0.0-rc.0.md) record package hashes and bounded execution evidence. Main publication requires a fresh validated candidate for its own release commit; branch validation does not establish npm publication.

Physical iOS/Android RC execution and two independent documentation-only evaluations remain unperformed. Independent evaluations require real projects and consented evidence; maintainer automation cannot fill those records. Keep #20 and M5 open until these gates are evidenced, and retain the experimental channel.

## Main publication

[PR #39](https://github.com/gronxb/tauri-native/pull/39) preserved the original README demo GIF. Its [main release run at `e10d1d6`](https://github.com/gronxb/tauri-native/actions/runs/34130137022) failed during desktop event validation: the reader parsed a newly created report before its JSON body was written. The uploaded report is zero bytes. Async exports and real Tauri async IPC parity had already passed; mobile receiving jobs and publication did not run.

[PR #40](https://github.com/gronxb/tauri-native/pull/40), merged as `1fbb5a3`, fixes report readiness in both desktop event and Fieldnotes probes. Four deterministic child-process regressions reproduce the prior failures and pass with the correction; CLI typecheck and both script syntax checks also pass. The [release workflow for main at `1fbb5a3`](https://github.com/gronxb/tauri-native/actions/runs/34133681385) completed successfully, including producer, iOS, Android, candidate aggregation and npm publication. Downloaded evidence was checked for this exact release commit; the earlier branch candidate was not substituted for the main gate.

The [current main producer job](https://github.com/gronxb/tauri-native/actions/runs/34133681385/job/101779549883) passed. Downloaded input and evidence were checked against `1fbb5a3`: the archive and all three package hashes match their receipt, packed manifests match the checkout, the corrected desktop event report passed, and both original and changed-Rust Fieldnotes passed save/search/relaunch and source-preserving exports. Installing/exporting/removing the CLI left a successful ordinary desktop Release build with no remaining JavaScript diff. All three 1.0.0-rc.0 tarballs are byte-identical to the previously verified `eb1fab8` RC packages. These remain automated maintainer checks.

The [current main Android job](https://github.com/gronxb/tauri-native/actions/runs/34133681385/job/101794431578) passed in 46m23s. Downloaded evidence matches the exact `1fbb5a3` commit, producer receipt and package hashes. All 13 required Android JUnit scenarios passed without failures, errors or skips. Original and changed-Rust Fieldnotes passed in RN, Lynx and Expo after producer deletion, with host builds requiring no Rust toolchain. Async/scoped-view lifetimes, pending navigation and fully minified Lynx acceptance passed. The copied standalone APK executed on API 36 x86_64 with 16 KB pages, observed the Rust update, and balanced all 11 responses with 11 frees. This execution evidence covers the named emulator, not physical hardware.

The [current main iOS job](https://github.com/gronxb/tauri-native/actions/runs/34133681385/job/101794431602) passed in 1h29m43s. Downloaded evidence matches the same main commit, producer receipt and package hashes. All 13 required iOS JUnit scenarios passed without failures, errors or skips, covering original and changed-Rust Fieldnotes in RN/Lynx/Expo, pending navigation, and RN/Lynx async/scoped-view lifetimes. Both feature phases confirm producer deletion and host builds without Rust. This is simulator execution evidence.

The aggregate candidate passed and contains the exact verified tarballs. The [release job](https://github.com/gronxb/tauri-native/actions/runs/34133681385/job/101816607728) published `@tauri-native/cli`, `@tauri-native/react-native` and `@tauri-native/lynx` at `1.0.0-rc.0` with public access on the `experimental` npm channel. Registry verification at 2026-09-07 16:58 UTC confirmed all three versions and tags; downloaded registry tarballs are byte-identical to the candidate and match npm SHA-1/SHA-512 integrity metadata. Publication is complete for this experimental candidate.

Physical iOS/Android RC execution and two independent documentation-only integrations remain unperformed. These gates still keep #20, #21 and M5 open; automated maintainer checks and successful RC publication do not establish stable 1.0 readiness.



## Added release requirement — Tauri Mobile preservation (2026-09-09)

The published 1.0.0-rc.0 candidate remains evidence for the limited adapter. The revised [PRD #21](https://github.com/gronxb/tauri-native/issues/21) additionally requires an ordinary Tauri Mobile application with RN/Lynx composition. Before declaring the revised product ready:

- [ ] Complete M6–M8: [#41](https://github.com/gronxb/tauri-native/issues/41), [#42](https://github.com/gronxb/tauri-native/issues/42), [#43](https://github.com/gronxb/tauri-native/issues/43), [#44](https://github.com/gronxb/tauri-native/issues/44), [#45](https://github.com/gronxb/tauri-native/issues/45), [#46](https://github.com/gronxb/tauri-native/issues/46), [#47](https://github.com/gronxb/tauri-native/issues/47).
- [ ] Demonstrate standalone Tauri iOS/Android plus RN and Lynx on both platforms, with real setup/State/AppHandle, native plugins, capabilities and lifecycle parity.
- [ ] Keep physical-device and independent-onboarding gates; do not reinterpret old candidate passes as new runtime-preservation evidence.

See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md). Current release preparation is historical completed work; these added gates remain open.

M8 #46 now has a first package-owned Android Lynx retained-runtime execution: [Lynx Android retained SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json). The packed SDK passes on a non-debuggable arm64 Release/R8 emulator alongside the original Tauri frontend, including native plugins/permissions, background deep links and renderer event cleanup. This scoped result does not satisfy six-combination parity, physical-device or independent-onboarding requirements. Automatic composition, retained TauriView, iOS and RN/Expo package integration remain open; no new package publication is authorized or performed.
