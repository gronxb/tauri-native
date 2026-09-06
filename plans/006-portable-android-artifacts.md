# [M1] Export equivalent portable Android libraries and assets

## Outcome

Android needs the same source-transparent export/relocation contract as iOS. Preserve the existing separation between application artifacts and reusable host bridges.

## Product contract

The Tauri project should know as little as possible about tauri-native. The intended workflow is **install the CLI → export native artifacts → move/copy them → integrate in the host**. Integration belongs in the CLI and host package.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M1 — CLI-only portable native artifacts](https://github.com/gronxb/tauri-native/milestone/2)
- Priority: **P1** · Effort: **L** · Implementation risk: **MED**
- Category: direction
- Depends on: [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8), [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/006-portable-android-artifacts.md`
- Issue: [#10](https://github.com/gronxb/tauri-native/issues/10)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — implementation verified on 2026-09-06; merged in [PR #26](https://github.com/gronxb/tauri-native/pull/26).

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/cli/src/commands/export-android.ts:28`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-android.ts#L28): Exports four Android ABIs.
- [`packages/cli/src/commands/export-android.ts:45`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-android.ts#L45): Normalizes libraries to libtauri_native_core.so.
- [`docs/adr/0003-android-runtime-and-export-boundary.md:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/docs/adr/0003-android-runtime-and-export-boundary.md#L1): App-owned libraries/assets were chosen over a fat host-specific AAR.

Representative current source:

```
const OUTPUT_LIBRARY_NAME = 'libtauri_native_core.so';
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/commands/export-android.ts packages/cli/src/commands/export-android.ts docs/adr/0003-android-runtime-and-export-boundary.md` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/commands/export-android.ts
- packages/cli/src/artifacts/
- packages/cli/test/
- packages/cli/package.json
- packages/cli/README.md
- docs/artifacts.md

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Use ordinary-project discovery and the generated adapter without requiring producer cdylib edits or a custom app-core.

2. Export normalized jniLibs/assets plus the shared relative-path manifest, fingerprints and command/type metadata. Reusable JNI/framework code remains in host packages; preserve the no-fat-AAR decision.

3. Stage/promote validated output; check supported ABI set, API floor, ELF/page-size compatibility and packaged frontend before replacement.

4. Add test:export:android: relocate output, hide source checkout, compile a minimal host and execute both transport paths on the documented emulator.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Android artifact/package tests pass. |
| New gate to add | `nub --cwd packages/cli run test:export:android` | Configured toolchain/emulator executes relocated direct and embedded calls. |
| Gate from M0 | `nub --cwd packages/cli run test:export:contract` | Authored source stays unchanged. |

## Meaningful test scenarios

- All documented ABIs contain the normalized library and expected generated symbols.
- Partial output never replaces a valid artifact set.
- Verify 16 KB ELF and APK alignment using Android tools, not configuration-text assertions.
- Host can build while producer source/Rust toolchain are unavailable.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] No custom producer ABI or manifest restructuring required.
- [x] Manifest/failure semantics match iOS.
- [x] Documented ABIs validate and both transports execute.
- [x] No RN/Lynx-specific source is duplicated into application artifacts.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Do not introduce a host-specific export fork or fat AAR without revisiting the accepted artifact boundary.

Reuse the metadata contract, not platform-specific build implementation. Keep architecture support explicit.

Use a `codex/portable-android-artifacts` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Execution evidence — 2026-09-06

- Ordinary producer export now writes four normalized libraries, unchanged assets, generated C header, command metadata and the shared versioned checksum manifest. No host JNI/framework source is included in the producer artifacts.
- Fixed cargo-ndk's initial metadata working directory so export from a normal frontend project root selects the disposable generated Cargo workspace. Final linker options set 16 KB alignment and the normalized library SONAME without changing producer Cargo configuration.
- The NDK's real `llvm-readelf` validates machine/class, API 24 identification, every LOAD segment, ABI functions, SONAME and platform dependencies. Output uses the same staged/atomic macOS publication as iOS.
- `test:export:android` passed on API 37 arm64-v8a with `getconf PAGE_SIZE` = 16384. The installed packed CLI exported the ordinary fixture; its producer and CLI installation were then deleted. A separate Java/JNI/WebView host built from copied artifacts in a path with spaces while Rust was absent from its PATH. Three direct and eight unchanged frontend calls passed, with 11 matching frees.
- All four core and host JNI ABIs were compiled/inspected. The signed APK passed `zipalign -c -P 16 -v 4` and signature verification. Only the named emulator ABI was executed; other CPU/API/physical-device execution is not claimed.
- A real frontend build failure and actual C libraries with 4 KB alignment, API 26, wrong SONAME, wrong machine and an unbundled shared dependency could not replace the previous export even with refreshed checksums. Metadata tests also cover missing ABIs and incompatible layout/API/page values.
- CLI: 27 tests, packed package verification and TypeScript passed. The full iOS relocation gate passed again after the shared manifest change. Explicit legacy Android export passed as ABI 0. M0 source/parity code is unchanged from PR #25's passing contract run; Android source integrity is additionally asserted by this platform gate.
- Local evidence: `target/export-android/report.json`, `target/export-ios/report.json`; unchanged M0 baseline: `target/export-contract/report.json`.
- Producer publication is currently verified on macOS; Linux/Windows atomic replacement remains unsupported. RN/Expo and Lynx SDK consumption remain #11/#12.
