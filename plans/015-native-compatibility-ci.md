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
- Status: DONE — [PR #36](https://github.com/gronxb/tauri-native/pull/36) merged as `75a6a38`; the complete hosted matrix and candidate at `fb4000f` passed.

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

- [x] All claimed support entries have linked automated/device evidence.
- [x] Native behavior/source integrity/external consumers are required gates.
- [x] Publication uses the validated candidate/commit.
- [x] Unavailable infrastructure is recorded as a gap, never a pass.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

If runner/signing/device access is unavailable, deliver reviewable configuration and record blocked evidence; do not claim completion of unrun native checks.

Scenario tests and a bounded matrix are sufficient. Avoid meaningless snapshots/coverage percentages. No new secrets or infrastructure purchases are authorized by writing this ticket.

Use a `codex/native-compatibility-ci` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Acceptance evidence

[PR #36](https://github.com/gronxb/tauri-native/pull/36) merged into main as `75a6a38`. Its [complete validation at `fb4000f`](https://github.com/gronxb/tauri-native/actions/runs/34111195208) passed the producer, iOS, Android and candidate jobs. The producer ran Rust, package, type, compatibility, watch, desktop and source-preserving export checks with the packed CLI.

Downloaded evidence contains all 13 required JUnit scenarios per platform, with no failures, errors or skips: original and Rust-refreshed Fieldnotes in RN/Expo/Lynx, pending navigation in all three hosts, and RN/Lynx async and scoped-view lifetimes. Both native receipts match the exact producer receipt and all three package hashes; the separately uploaded feature reports match their embedded receipt entries. Six pending-navigation observations per platform ranged from 3.601–9.305 seconds on iOS and 4.082–8.230 seconds on Android during an injected 20-second Rust delay, including automation overhead.

The copied standalone Android APK executed direct and unchanged-frontend calls on API 36 x86_64 with 16 KB pages, with a matching transferred APK hash. Full Release Lynx minification and runtime acceptance passed; its receipt records the generated R8 mapping hash. This resolves the incomplete full-app minification gate carried from #13. All three iOS slices and four Android ABIs were built and inspected; runtime evidence covers only the named simulator/emulator architectures.

The downloaded release candidate verifies the exact commit, all required successful jobs, tarball hashes and embedded package names, versions and publish settings. The main release workflow requires a fresh candidate for its own merge commit before publishing those exact tarballs. Earlier failed matrices produced no candidate, demonstrating that platform failures prevent aggregation. Five receipt, npm publication dry-run, command logging and failed-installation diagnostic regression scenarios also passed.

Physical-device RC execution and two independent documentation-only integrations remain open in #20. Hosted acceptance does not establish stable 1.0 readiness.
