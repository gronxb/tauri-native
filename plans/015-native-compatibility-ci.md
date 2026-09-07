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

The [rebased hosted producer job](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101579509176) passed its Rust, package, type, source-contract, watch, desktop and export gates. Its receiving iOS/Android jobs are still under acceptance; a successful producer does not certify native consumption. The final commit requires its own complete run. Local checks passed for candidate-receipt failures, the transferred standalone Android APK on a 16 KB arm64 emulator, and the full minified Lynx Fieldnotes success/error/relaunch, pending-navigation, async cancellation/runtime replacement and scoped-view flows. The changed-run native/web abandonment observations were 9.126 and 4.223 seconds during a 20-second Rust delay.

An actual npm dry-run exposed that publishing a tarball without explicit channel flags selects `latest`, despite its embedded experimental publish settings. The release script now passes the validated registry, channel and access settings explicitly. Its scenario test runs real npm behind a mandatory dry-run wrapper, fails against the previous script and passes with the fix; no package is published by this test.

The [Android receiving job](https://github.com/gronxb/tauri-native/actions/runs/34067737240/job/101583216946) built all three Release hosts and passed their 16 KB alignment checks, but every installation failed because the emulator's internal data disk lacked space. Runtime checks did not run. The workflow now configures a 6 GB data disk and checks page size and available storage before native builds. Hosted installation and runtime acceptance still require a successful rerun.
