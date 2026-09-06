# [M2] Bring Lynx to the same artifact-only integration contract

## Outcome

Lynx should consume the same application artifacts as RN without source-path assumptions or Lynx-specific modifications in the producer.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M2 — Drop-in artifacts for React Native and Lynx](https://github.com/gronxb/tauri-native/milestone/3)
- Priority: **P1** · Effort: **M** · Implementation risk: **MED**
- Category: direction
- Depends on: [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9), [#10 — [M1] Export equivalent portable Android libraries and assets](https://github.com/gronxb/tauri-native/issues/10), [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/008-lynx-artifact-parity.md`
- Issue: [#12](https://github.com/gronxb/tauri-native/issues/12)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: IMPLEMENTED — all package and native gates passed; PR merge pending.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/lynx/ios/TauriNativeLynx.podspec:27`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/lynx/ios/TauriNativeLynx.podspec#L27): Depends on the shared TauriNativeGenerated Pod.
- [`packages/lynx/src/index.ts:26`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/lynx/src/index.ts#L26): Calls through generated NativeModules.
- [`docs/adr/0002-lynx-host-boundary.md:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/docs/adr/0002-lynx-host-boundary.md#L1): Uses public native-module/autolink APIs with Lynx lifecycle ownership.

Representative current source:

```
s.dependency "TauriNativeGenerated"
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/lynx/ios/TauriNativeLynx.podspec packages/lynx/src/index.ts docs/adr/0002-lynx-host-boundary.md` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/lynx/README.md
- packages/lynx/ios/ and android/ (integration/validation only)
- packages/lynx/package.json
- examples/lynx/
- docs/artifacts.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Configure/document copied-export consumption on both platforms using the M1 artifact manifest and normalized files.

2. Retain public Lynx native modules/autolinking. Do not install private JSI hooks or change Tauri producer code.

3. Use byte-identical platform artifacts from the RN integration fixture to prove host independence. Share metadata validation only where concrete duplication warrants it.

4. Add Android E2E parity and update iOS checks for relocation, invalid artifacts, mount/unmount and relaunch behavior.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/lynx run test` | Codegen/type/package checks pass without generated drift. |
| Existing native gate | `nub --cwd examples/lynx run test:e2e:ios` | Copied-artifact direct/embedded flows pass. |
| New gate to add | `nub --cwd examples/lynx run test:e2e:android` | Equivalent Android flow passes. |

## Meaningful test scenarios

- RN and Lynx consume identical application artifacts.
- Missing/incompatible artifacts fail with no source fallback.
- Native calls respect Lynx background scripting.
- Mount/unmount/relaunch do not duplicate registration or lose assets.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Both platforms need only host package plus copied artifact.
- [x] No Lynx-specific producer branch or export variant.
- [x] Both transports pass on both platforms.
- [x] Docs agree with the shared artifact contract.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Report private-runtime or producer-coupling requirements instead of forking the producer contract.

Follow current autolink/codegen patterns; regenerate generated files rather than editing bindings manually.

Use a `codex/lynx-artifact-parity` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Execution result — 2026-09-06

The Lynx host package now ships a Node-only artifact reader from the same canonical implementation as RN, without a runtime dependency on RN or the CLI. The example validates and consumes its own copied `tauri-native/ios` and `tauri-native/android` directories through a local Pod and Gradle source sets. Public native modules/autolinking and producer code remain unchanged.

A fresh host outside the workspace installed the packed Lynx SDK with npm and consumed the byte-identical M1 artifacts used by the RN/Expo gate. Those export gates deleted the producer and CLI installation. Both Release builds ran with no `cargo` or `rustc` on PATH and no CLI/RN package in the host. Lynx 4.0.1 / ReactLynx 0.125.0 passed on iOS 26.4.1 arm64 simulator and Android API 37 arm64 emulator with 16 KB pages.

Each platform passed eight direct command cases and the unchanged frontend's eight cases, including structured errors, unknown commands, nulls and tagged enums. The same flow verified unmount/remount and app relaunch. Complete replacement with legacy calculator exports, refreshed Pods and Release rebuilds then passed the existing calculator flow on both platforms. Both Android APKs passed `zipalign -c -P 16 -v 4`.

The package's two artifact scenarios cover generated/legacy parity and missing, corrupt, incompatible or linked inputs. RN's six existing artifact/plugin scenarios still pass. Codegen has no drift, SDK/example type checks pass, and isolated package checks verify 30 Lynx and 56 RN files. Fresh npm installation required matching the example's React types and TypeScript version to the declared Lynx UI/Rspeedy peer ranges; a frozen workspace lockfile check also passes.

Reproduction is documented in `packages/lynx/test/native-artifacts/README.md`; local evidence is `target/lynx-artifacts/report.json` plus four JUnit reports. Native flow durations were 18 s (iOS), 28 s (Android), 26 s (calculator iOS) and 39 s (calculator Android). These results do not claim physical-device execution or independent external adoption.
