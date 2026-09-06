# [M1] Export a relocatable iOS XCFramework and frontend bundle

## Outcome

The intended workflow is install CLI, export, and move one artifact directory. The exported native code/assets must work independently of the original checkout and author-machine paths.

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
- Depends on: [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/005-portable-ios-artifacts.md`
- Issue: [#9](https://github.com/gronxb/tauri-native/issues/9)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: TODO.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/cli/src/commands/export-ios.ts:46`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-ios.ts#L46): Already emits a local TauriNativeGenerated podspec.
- [`packages/cli/src/commands/export-ios.ts:150`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/cli/src/commands/export-ios.ts#L150): Creates an XCFramework for device/simulator inputs.
- [`packages/react-native/app.plugin.js:81`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/app.plugin.js#L81): Host currently follows tauriDir into the producer checkout.

Representative current source:

```
s.vendored_frameworks = "TauriNativeCore.xcframework"
s.resources = "TauriNativeAssets.bundle"
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/cli/src/commands/export-ios.ts packages/cli/src/commands/export-ios.ts packages/react-native/app.plugin.js` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/commands/export-ios.ts
- packages/cli/src/artifacts/ (minimal shared metadata/staging helpers)
- packages/cli/test/
- packages/cli/package.json
- packages/cli/README.md
- docs/artifacts.md (new)

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Connect export ios to ordinary-project discovery/generated adapters. Preserve supported device/simulator slices and local pod integration; the host must not compile Rust.

2. Define a minimal shared manifest with format/ABI version, CLI/API compatibility, platform/architectures, source fingerprints, command/type metadata references and relative file/checksum entries. Exclude secrets and source-machine absolute paths.

3. Build into staging and promote only after validation. Export XCFramework, unchanged frontend assets, local podspec and manifest as one relocatable directory. Archive support is optional convenience, not a registry product.

4. Add test:export:ios: copy the directory elsewhere, make the source checkout unavailable, and compile/run a native consumer from only that copy. Document CocoaPods/manual Xcode use.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Artifact/manifest/podspec tests pass. |
| New gate to add | `nub --cwd packages/cli run test:export:ios` | On a configured Mac, relocated output builds/runs in the simulator without source access. |
| Gate from M0 | `nub --cwd packages/cli run test:export:contract` | Source integrity and command parity pass. |

## Meaningful test scenarios

- Relocation into a path with spaces; no original source path required.
- Missing slice, incompatible ABI, corrupt artifact and interrupted export preserve last valid output.
- Frontend file bytes match the configured frontendDist.
- Host compilation succeeds with Rust toolchain unavailable to the host build environment.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [ ] npx tauri-native export ios works on the supported ordinary fixture after CLI installation.
- [ ] One copied export directory suffices for host integration.
- [ ] Device/simulator slices and manifest integrity are checked.
- [ ] Failed exports preserve the prior valid output.
- [ ] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [ ] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Reading the source checkout, copying application source into the host, or rebuilding Rust in the host violates this artifact-only gate.

Resources may be a sibling bundle next to the XCFramework. Describe the entire exportable directory honestly; do not claim resources automatically live inside a framework.

Use a `codex/portable-ios-artifacts` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.
