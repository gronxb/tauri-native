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

M8 #46 now has package-owned Lynx retained-runtime execution on both platforms: [Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json), [iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-ios-2026-09-09.json). Packed SDKs pass arm64 Release native plugins/permissions, background deep links and renderer event cleanup alongside the original Tauri frontend. Android retains non-debuggable R8 optimization; iOS also removes Lynx while preserving the working original frontend, process and delegate. These scoped results do not satisfy six-combination parity, physical-device or independent-onboarding requirements. Automatic composition, retained TauriView, RN/Expo integration and complete lifecycle/parity gates remain open; no new package publication is authorized or performed.

M8 #45 now also has packed RN Android retained-runtime execution: [RN Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json). The non-debuggable arm64 Release/R8 gate passes shared state/setup, actual plugins/permissions, BackHandler/Linking, background events and RN engine replacement/removal while the original frontend remains working in the same process. RN iOS, Expo, automatic composition, retained TauriView, remaining lifecycle cases and full six-combination/device/independent-onboarding requirements remain open. No new release or publication is claimed.

M8 #45 now has packed RN iOS and Android Release execution. [RN iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-2026-09-09.json) adds original Swift plugins/permissions, background Tauri events and verified RN JS-thread termination after removal while the independent original frontend and delegate continue in one process. These scoped SDK gates use explicit consumer attachment and existing producer-deleted artifacts. They do not complete Expo/automatic composition, retained TauriView, iOS RN Linking forwarding, full lifecycle/six-combination parity or the physical-device and independent-onboarding release gates. No package publication is performed.

M8 #45 adds a packed Android composer and ten Release UI flows, including an unmodified generated Activity with no acceptance hooks. [Android composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-android-2026-09-09.json) verifies original Tauri startup/state/plugins and RN lifecycle, with native library bytes preserved. Six configuration scenarios protect regeneration, upgrades and prior outputs on conflict/failure. This does not complete Expo/iOS/Lynx automatic composition, retained TauriView or the remaining parity/device/independent-onboarding gates. No package publication is performed.

M8 #45 now has RN automatic composition evidence on both platforms. [iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-ios-2026-09-09.json) adds two successful CocoaPods installations with regeneration between them and nine source-free Release UI flows, including unmodified generated startup/default layout. The original Tauri delegate/plugins/state remain alive and RN removal cleans up its listeners and JS thread. These scoped simulator results leave Expo, Lynx automatic composition, retained TauriView, broader lifecycle/six-combination parity, physical devices and independent onboarding open. No new release or package publication is performed.

M8 #46 now adds Lynx Android automatic composition: [evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-android-2026-09-09.json). Nine source-free Release/R8 flows pass with original Tauri startup/plugins/state, renderer replacement/removal and an unmodified generated Activity/default layout. The failed initial baseline wait remains separate evidence with an unconfirmed cause; fresh latest-exporter/startup validation is still required. This scoped execution does not complete Lynx iOS composition, Expo, retained TauriView, full lifecycle/parity, physical-device or independent-onboarding gates. No package publication is performed.

The current Android exporter now passes source-free native acceptance and RN/Lynx automatic-composition consumption from the same artifact: [fresh Android export and SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-android-composition-2026-09-09.json). Nineteen SDK UI flows and both unmodified generated applications pass; original source hashes, native plugins/permissions and renderer cleanup are verified. This resolves the fresh-export evidence gap, while repeated startup reliability, complete lifecycle/parity, physical devices and independent onboarding remain open. No package publication is performed.

Lynx iOS automatic composition now passes two CocoaPods integrations and nine source-free Release UI flows, including unmodified generated startup/default layout: [Lynx iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-ios-2026-09-10.json). Original Tauri archive bytes, deployment target, AppDelegate, plugins and frontend continuity are preserved. This supplies scoped automatic-composition execution on both platforms for both SDKs. Expo, third-party autolinking, retained TauriView, pending OS callback renderer retirement, complete parity, physical devices and independent onboarding remain required. No issue or release is closed and no package is published.

Pending OS permission renderer retirement and session-open error parity now pass
in all four packed RN/Lynx platform gates: [SDK permission-retirement evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-sdk-permission-retirement-2026-09-11.json). Forty-one Release UI flows
verify the old renderer cannot save after retirement, a new renderer can use
the real granted permission, original state/setup/plugins remain intact, and
unmodified generated startup works. A fresh unchanged-producer iOS export also
passes twelve standalone native flows: [fresh iOS export evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-ios-2026-09-10.json). The initial Lynx Android report
collection failure is retained separately from the successful full rerun.
Expo CNG, third-party autolinking, retained TauriView/navigation, RN iOS Linking, Activity recreation/RN-owned permissions, broader source forms/native channels, complete parity/CI/migration, physical devices and independent adopters remain open. No issue or release is closed and no package is published.

RN iOS URL delivery now passes eighteen packed Release UI flows: [RN iOS Linking evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-linking-2026-09-11.json).
The original Tauri AppDelegate object and return values are preserved, its
callbacks are restored after RN removal, and actual custom URLs reach the
current RN engine once per invocation. UIKit launch URLs remain initial URLs
across reload; a URL received during delayed renderer attachment stays an event.
Both acceptance and unmodified generated apps pass with the existing immutable
artifact. Native activity injection is distinct from pending OS Universal Link
association. Expo, third-party autolinking, retained TauriView, broader source
forms and lifecycle cases, complete parity/CI/migration and device/adopter gates
remain open. No issue or release is closed and no package is published.

## Retained Lynx view progress — 2026-09-11

The public retained Lynx `TauriView` reuses the original Tauri WebView on iOS and
Android. [34 Release UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-view-2026-09-11.json) pass in packed, source-free consumers,
including unmodified generated startup/default layouts. Embedded frontend and
native calls share actual plugin state and notes; competing mounts are rejected;
view/renderer replacement and close preserve the original document, delegate/client,
state and single setup. The original producer and runtime artifacts are unchanged.
See [#46](https://github.com/gronxb/tauri-native/issues/46) for the precise single-view
scope. RN TauriView, broader navigation/lifecycle and Expo/autolinking/parity/CI/
migration/device/adopter acceptance remain open. No release or roadmap gate is closed.
