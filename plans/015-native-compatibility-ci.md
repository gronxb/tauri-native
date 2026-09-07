# [M5] Gate changes with native, compatibility, and package verification

## Outcome

A release workflow alone cannot establish a cross-language/native support promise. Validate real exports, lifecycle behavior, version compatibility and package consumption outside the developer checkout.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M5 — Validate adoption and ship 1.0](https://github.com/gronxb/tauri-native/milestone/6)
- Priority: **P1** · Effort: **L** · Implementation risk: **MED**
- Category: direction
- Depends on: [#6 — [M0] Define compatibility and source-integrity acceptance fixtures](https://github.com/gronxb/tauri-native/issues/6), [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11), [#12 — [M2] Bring Lynx to the same artifact-only integration contract](https://github.com/gronxb/tauri-native/issues/12), [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13), [#14 — [M3] Generate host TypeScript contracts from existing Rust commands](https://github.com/gronxb/tauri-native/issues/14), [#15 — [M3] Connect host view lifecycle and scoped frontend interaction](https://github.com/gronxb/tauri-native/issues/15), [#17 — [M4] Refresh exports with correct caching and a watch workflow](https://github.com/gronxb/tauri-native/issues/17), [#18 — [M5] Demonstrate a useful Tauri feature in independent mobile hosts](https://github.com/gronxb/tauri-native/issues/18)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/015-native-compatibility-ci.md`
- Issue: [#19](https://github.com/gronxb/tauri-native/issues/19)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: IN PROGRESS — required native/package validation and publication of the same candidate; #18 is merged and the hosted matrix is under acceptance.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`.github/workflows/release.yml:16`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/.github/workflows/release.yml#L16): Current workflow installs dependencies and runs Changesets release work.
- [`packages/cli/package.json:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/package.json#L1): CLI has unit and package tests.
- [`examples/react-native/.maestro/ios-integration.yaml:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/react-native/.maestro/ios-integration.yaml#L1): Existing iOS flow exercises both calculator transports.

Representative current source:

```
- run: nub ci
- uses: changesets/action@v2.1.1
```

Before implementation, inspect `git diff 117e887..HEAD -- .github/workflows/release.yml packages/cli/package.json examples/react-native/.maestro/ios-integration.yaml` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- .github/workflows/
- scripts/verify-package.mjs
- packages/*/package.json (checks only)
- packages/cli/test/ and native-export fixtures
- examples/react-native/.maestro/
- examples/lynx/.maestro/
- docs/compatibility.md
- docs/validation.md (new)

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Add PR Rust/unit/type/package/source-integrity checks. Run package tests in documented directories; fix wrapping-sensitive assertions meaningfully rather than suppressing failures.

2. Define a bounded supported Tauri/API and RN/Expo/Lynx version matrix starting with repository-pinned baselines. Each claim needs iOS/Android evidence for direct and embedded paths; do not imply every version cross-product.

3. Use configured Mac/Android runners for native relocation and packed consumers, release builds, async cancellation/teardown, serde/errors, ABI mismatch, and Android page-size packaging. Record physical-device RC checks where CI cannot supply them.

4. Gate publication on validation of the same candidate/commit. Publish reproducible commands/logs; pending devices/runners/signing are unresolved gates, not skipped-to-green success. Use existing secret management without exposing credentials.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `cargo test --workspace --locked` | On supported native toolchain, Rust core/desktop tests pass. |
| Existing baselines | `nub --cwd packages/cli run test && nub --cwd packages/react-native run test && nub --cwd packages/lynx run test` | All package checks pass. |
| Native gates | `nub --cwd packages/cli run test:export:ios && nub --cwd packages/cli run test:export:android && nub --cwd packages/cli run test:external-consumer` | Configured runners validate real outputs and consumers. |
| Workflow evidence | Run new validation workflow on a branch/PR and attach run URLs for each support entry. | Every required job passes for the release candidate commit. |

## Meaningful test scenarios

- Incompatible artifact/ABI is rejected by an actual consumer.
- Real invoke error/async teardown regression fails transport tests.
- A packed package missing a needed native/generated file fails outside the monorepo.
- Failed/pending required checks prevent publication.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [ ] All claimed support entries have linked automated/device evidence.
- [ ] Native behavior/source integrity/external consumers are required gates.
- [ ] Publication uses the validated candidate/commit.
- [ ] Unavailable infrastructure is recorded as a gap, never a pass.
- [ ] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [ ] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If runner/signing/device access is unavailable, deliver reviewable configuration and record blocked evidence; do not claim completion of unrun native checks.

Scenario tests and a bounded matrix are sufficient. Avoid meaningless snapshots/coverage percentages. No new secrets or infrastructure purchases are authorized by writing this ticket.

Use a `codex/native-compatibility-ci` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Known integration check from #13

The ABI 2 Release lifecycle gates pass on all four host/platform combinations. R8 preserves JNI names and the annotated WebView entry point in both compiled SDK bridges. A full Lynx independent-host minification attempt fails on missing optional XElement/Fresco/Gson/ServalMarkdown classes. Establish a minimal, properly declared minified host dependency set and run that full-app gate here; do not treat the scoped bridge check as full-app minification evidence.

## Acceptance progress

The [hosted producer job at f04f593](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101579509176) passed Rust, package, type, compatibility, watch, desktop and export acceptance. The [iOS receiving job](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101583216992) also passed: original and changed-Rust Fieldnotes on React Native, Expo and Lynx, pending navigation in all three hosts, and RN/Lynx async and scoped-view lifetimes. All 13 JUnit scenarios passed without failures or skips. The native receipt validates against the transferred producer receipt, archive and package hashes. During the injected 20-second Rust delay, the six iOS pending-navigation observations ranged from 3.490 to 9.143 seconds, including automation overhead.

The [Android receiving job](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101583216946) built all three Release hosts and passed their 16 KB alignment checks, but every installation failed because the emulator's default data disk lacked space. Runtime checks did not run. The [candidate job](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101599111145) received successful producer/iOS results and the failed Android result, rejected aggregation, and produced no release-candidate artifact. The workflow now configures a 6 GB data disk and checks page size and available storage before compilation. Hosted installation and runtime acceptance still require a successful rerun. The [RC Android job at 4f9b911](https://github.com/gronxb/tauri-native/actions/runs/34073619475/job/101604256647), which includes these CI fixes, passed preflight with 16,384-byte pages and 5,155,156 KiB free on the data disk. All three Release builds and alignment checks passed. RN and Lynx installation then failed with a package-service broken pipe; Expo installed successfully but its Maestro driver did not start. No host runtime flow passed. That run did not retain enough system evidence to establish a cause; the later diagnostic run is described below.

Local acceptance also passed for the transferred standalone Android APK on a 16 KB arm64 emulator and fully minified Lynx document, pending-navigation, async cancellation/runtime replacement and scoped-view flows. An actual npm dry-run exposed that tarball publication needs explicit channel arguments; the release script now passes the validated registry, channel and access settings. Its regression scenario fails against the previous script and passes through a mandatory dry-run wrapper without publishing. Command logging now streams output while preserving literal arguments and nonzero exits. CI uses the boolean value accepted by the ordinary Tauri CLI; the complete RC install/export/uninstall/desktop-build scenario passed locally with CI=true.

The [producer at 28ca82f](https://github.com/gronxb/tauri-native/actions/runs/34078784120/job/101610092979) and [iOS receiving job](https://github.com/gronxb/tauri-native/actions/runs/34078784120/job/101616811595) passed. Downloaded evidence verifies the commit, archive, package hashes and native receipt; all 13 iOS JUnit scenarios passed without failures or skips. The [Android receiving job](https://github.com/gronxb/tauri-native/actions/runs/34078784120/job/101616811610) passed all three Release builds and 16 KB alignment checks, but RN/Expo installation failed and Lynx's Maestro driver did not start. No runtime flow passed. New diagnostics record 1,498,276 KiB guest RAM, low-memory kills and a `surfaceflinger` abort in `mapper.ranchu` (`hasReadColorBufferDma`) in both failed installation logs, followed by framework restarts. The candidate job rejected aggregation and produced no release-candidate artifact.

The workflow now selects the published API 36 16 KB image, configures 4 GB RAM and uses the supported software renderer. These changes require a fresh hosted matrix before claiming resolution. Installation and flow failures remain fatal; diagnostic collection does not retry them. Five receipt, publication and logging regression scenarios passed for the diagnostic change. The issue and PR remain open until all required jobs validate the final commit. Physical-device RC execution and independent onboarding remain separate open gates in #20.

The [RC iOS receiving job at 4f9b911](https://github.com/gronxb/tauri-native/actions/runs/34073619475/job/101604256576) passed all 13 JUnit scenarios without failures or skips: original and changed-Rust Fieldnotes in RN/Expo/Lynx, pending navigation in all three hosts, and RN/Lynx async and scoped-view lifetimes. Its receipt matches the transferred producer receipt and all three RC package hashes. The six pending-navigation observations ranged from 2.991 to 14.317 seconds during the injected 20-second Rust delay, including automation overhead. Android acceptance remains unresolved; iOS success does not certify the complete candidate.

The [9c4906f producer](https://github.com/gronxb/tauri-native/actions/runs/34100733974/job/101674347062) passed and its downloaded archive and package hashes were verified. The [Android job](https://github.com/gronxb/tauri-native/actions/runs/34100733974/job/101691570536) installed all three Release hosts; RN and Expo completed the original Fieldnotes flow. Lynx completed native save/search and embedded save, then failed the search after relaunch. Its retained screenshot, hierarchy and command log show the keyboard still open after Enter: the search tap at (540, 1518) landed inside the keyboard beginning at y=1517, while the status remained idle. Native-input steps now dismiss the Android keyboard explicitly before tapping save/search; iOS retains Enter. All result, persistence and pending-navigation assertions remain required. YAML parsing and diff checks pass; the corrected native matrix has not run yet.
