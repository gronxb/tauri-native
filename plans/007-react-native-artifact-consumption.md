# [M2] Let React Native and Expo consume copied artifacts only

## Outcome

Expo currently requires tauriDir pointing to the source project. Consumers should be able to receive an export from another machine/team and build with no producer checkout or Rust toolchain.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M2 — Drop-in artifacts for React Native and Lynx](https://github.com/gronxb/tauri-native/milestone/3)
- Priority: **P1** · Effort: **L** · Implementation risk: **MED**
- Category: direction
- Depends on: [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9), [#10 — [M1] Export equivalent portable Android libraries and assets](https://github.com/gronxb/tauri-native/issues/10)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/007-react-native-artifact-consumption.md`
- Issue: [#11](https://github.com/gronxb/tauri-native/issues/11)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — [PR #27](https://github.com/gronxb/tauri-native/pull/27) merged to main.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/react-native/app.plugin.js:33`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/app.plugin.js#L33): resolveTauriDir requires the producer directory.
- [`packages/react-native/app.plugin.js:81`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/app.plugin.js#L81): iOS copies from producer gen/tauri-native.
- [`packages/react-native/app.plugin.js:109`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/app.plugin.js#L109): Android similarly resolves source-owned exports.

Representative current source:

```
const exportDirectory = path.join(resolvedTauriDir, 'gen/tauri-native/ios');
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/react-native/app.plugin.js packages/react-native/app.plugin.js packages/react-native/app.plugin.js` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/react-native/app.plugin.js
- packages/react-native/test/
- packages/react-native/src/ and native loaders (artifact validation only)
- packages/react-native/README.md
- examples/react-native/
- docs/artifacts.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Add host-side artifact-directory configuration relative to the host. Validate manifest/platform/ABI/content before modifying generated host files; source paths must not be needed.

2. Keep Expo CNG idempotent and preserve unrelated Pods/libraries/assets. If tauriDir remains as convenience, normalize it to the same artifact reader and make it optional.

3. Document/test Expo and bare RN builds with the producer checkout and Rust toolchain inaccessible. Host packages still own Fabric/TurboModule and app lifecycle.

4. Add missing/corrupt/incompatible artifact diagnostics and copied-artifact E2E flows. Add test:e2e:android matching existing iOS coverage.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/react-native run test` | Plugin/package checks pass. |
| Existing baseline | `nub --cwd packages/react-native run typecheck` | Exit 0. |
| Existing native gate | `nub --cwd examples/react-native run test:e2e:ios` | After fixture build/install, both transports execute from copied output. |
| New gate to add | `nub --cwd examples/react-native run test:e2e:android` | Equivalent Android flow passes. |

## Meaningful test scenarios

- Fresh host consumes a copied artifact with no source access.
- Two prebuilds plus one artifact upgrade modify only dedicated integration files.
- Invalid manifest/frontend/platform fails before destructive copying.
- Direct and packaged-web calls return matching values/errors on both platforms.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Main quickstart config uses artifacts, not mandatory tauriDir.
- [x] Expo and bare integrations reproduce without source/Rust access.
- [x] Both transports pass on iOS/Android.
- [x] Repeat prebuild is idempotent and unrelated host files survive.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Secretly rebuilding producer code or needing sibling source paths means the artifact-only contract is not met.

Keep framework-specific dependencies and integration code in the host package and export tooling. Build diagnostics should remain separate from end-user product UI.

Use a `codex/react-native-artifact-consumption` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Implementation evidence — 2026-09-06

- Added host-relative `artifactsDir`, a shipped Node-only manifest/inventory validator and optional legacy-path normalization. Validation occurs before host edits and again on a private staged copy. Expo and bare hosts need neither the CLI nor producer source/Rust.
- Package tests: **6 passed**, including repeat prebuild, artifact upgrade, preserved host files, corrupt/missing/ABI/platform/format rejection, invalid Podfile and symlinks. Package verification: **56 files**; SDK and example typechecks passed. Fixtures use the actual CLI manifest writer.
- Installed the packed SDK into two fresh hosts outside the workspace: **bare RN 0.86.3 (no Expo)** and **Expo 57.0.20 / RN 0.86.3**. Both received byte-identical platform exports from the M1 gates, whose producer/CLI installations were deleted. Host builds used a PATH without Cargo/Rust.
- All four Release builds and Maestro flows passed: bare RN and Expo on **iOS Simulator 26.4.1 arm64** and **Android API 37 arm64-v8a / 16 KB pages**. Each checked **8 direct + 8 unchanged-frontend calls**, including structured errors, Unicode, null and tagged enums. Both Android APKs passed `zipalign -c -P 16 -v 4`. This does not claim physical-device or other-architecture execution.
- Real Expo CNG: **three `--no-clean` prebuilds** verified repetition, whole-artifact replacement and preservation of unrelated Podfile/library/asset files. Replacing an iOS archive with a different library name requires `pod install` to refresh link flags; documented and verified through the calculator upgrade.
- Existing iOS calculator flow and new Android flow passed against the copied legacy exports in an isolated QA bundle ID. Fixed the old iOS JSI label/fixed-screen tap and Android HTML input selection/duplicate keyboard dismissal. The source flows were unchanged apart from the isolated bundle ID for execution.
- Reproduction: `packages/react-native/test/native-artifacts/README.md`; local evidence: `target/react-native-artifacts/report.json` and six JUnit reports. These test-owned hosts do not count as external adopters.
