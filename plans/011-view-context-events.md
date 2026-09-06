# [M3] Connect host view lifecycle and scoped frontend interaction

## Outcome

TauriView currently exposes layout only. Embedded features need ready/error callbacks and context/actions while the frontend stays an ordinary web/Tauri application.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M3 — Real commands and host interaction](https://github.com/gronxb/tauri-native/milestone/4)
- Priority: **P2** · Effort: **L** · Implementation risk: **HIGH**
- Category: direction
- Depends on: [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11), [#12 — [M2] Bring Lynx to the same artifact-only integration contract](https://github.com/gronxb/tauri-native/issues/12), [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/011-view-context-events.md`
- Issue: [#15](https://github.com/gronxb/tauri-native/issues/15)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — [PR #32](https://github.com/gronxb/tauri-native/pull/32) merged into main as `c8d63a95da0993bcfc9b2fd01607ec03137af82f`; issue closed.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/react-native/src/TauriViewNativeComponent.ts:7`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/src/TauriViewNativeComponent.ts#L7): Only ViewProps exist.
- [`packages/react-native/ios/TNTauriWebView.swift:150`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/ios/TNTauriWebView.swift#L150): Invoke-only injected seam.
- [`packages/react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt:173`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt#L173): Android implements its own invoke seam.

Representative current source:

```
export interface NativeProps extends ViewProps {
}
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/react-native/src/TauriViewNativeComponent.ts packages/react-native/ios/TNTauriWebView.swift packages/react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/react-native/src/ and native view implementations
- packages/lynx/src/, types/ and native view elements
- packages/cli/test/fixtures/ interaction fixture
- packages/cli/package.json
- examples/react-native/
- examples/lynx/
- docs/compatibility.md
- host API docs

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Add host-owned ready/load/error callbacks and initial local route/query context using ordinary URL semantics. Preserve the packaged-origin boundary; no arbitrary remote URL feature.

2. Evaluate a minimal standard @tauri-apps/api/event listen/emit subset for host↔view notifications with an ordinary frontend fixture. Define exact targets, payload/order and unlisten semantics; do not imply global windows/plugin event compatibility.

3. Implement only the proven view-scoped subset in both hosts/platforms with generation-scoped cleanup. Broader Rust AppHandle emission/state and channels remain conditional on the compatibility decision.

4. If standard event fidelity cannot satisfy M0, deliver lifecycle/URL context and record the blocked event capability with evidence. Do not substitute a mandatory proprietary frontend SDK. Add test:events for supported behavior and explicit unsupported outcomes.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/react-native run typecheck && nub --cwd packages/lynx run typecheck` | Both view APIs compile. |
| New gate to add | `nub --cwd packages/cli run test:events` | Documented standard event subset/diagnostics match fixtures. |
| Native gates from M2 | `nub --cwd examples/react-native run test:e2e:ios && nub --cwd examples/react-native run test:e2e:android` | Ready/error/context and supported interactions pass. |
| Native gates from M2 | `nub --cwd examples/lynx run test:e2e:ios && nub --cwd examples/lynx run test:e2e:android` | Equivalent Lynx results. |

## Meaningful test scenarios

- Document ID is passed through a local URL and read by ordinary frontend code.
- Ready timing and asset/navigation errors are observable by the host.
- Unlisten/unmount removes listeners; two view instances do not cross-deliver.
- The same standard frontend fixture runs on desktop without host globals/imports.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Ready/error and local initial context work on both hosts.
- [x] Supported/blocked event capabilities are explicitly evidenced.
- [x] No producer custom global or dependency is mandatory.
- [x] Cleanup follows the async lifetime protocol.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Full-runtime or fabricated AppHandle requirements are blocked capabilities, not reasons to invent a general event framework.

Standard Tauri events and normal URL parameters are acceptable producer APIs. The producer must not need a tauri-native frontend API.

Use a `codex/view-context-events` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Implementation evidence (2026-09-07)

- The host API now exposes local path/query/fragment context, start/ready/error callbacks and scoped JSON messages. Native Android navigation does not reset a document session that has already opened; packaged URLs are served by the existing local asset interceptor.
- `test:events` passes eight scenarios using the actual pinned Tauri event/core modules against all four injected shims. Default/global/window/system targets fail explicitly; listener limits, unlisten/once and retired-document isolation are exercised.
- `test:events:export` runs a real ordinary Tauri 2.11.5 desktop frontend with API 2.11.1, installs the packed CLI, exports all mobile slices, verifies source/frontend hashes plus Git diff, and deletes the producer. Report: `target/view-events/export-report.json`.
- RN 0.86.3 and Lynx 4.0.1 Release hosts pass the two-view flow on iOS Simulator 26.4.1 and Android API 37/16 KB: RN iOS 28 s, Lynx iOS 31 s, RN Android 60 s, Lynx Android 66 s. Android uses a dedicated test emulator to avoid interference from unrelated work.
- All four existing async lifecycle regressions pass: RN iOS 57 s, Lynx iOS 53 s, RN Android 52 s, Lynx Android 54 s. Pending work, cancellation, document reload, remount and actual native runtime replacement remain verified.
- Host builds use packed SDKs and copied artifacts without Rust on PATH. Both APKs pass 16 KB ZIP alignment. CLI 33 tests, RN 9 tests, Lynx 2 tests, package checks and typechecks pass. Input hashes and eight native reports are recorded in `target/view-events/host-report.json`.
- [ADR 0006](../docs/adr/0006-view-context-events.md), [view API](../docs/view-interaction.md) and [reproduction guide](../docs/testing-views.md) document the exact subset. General ACL/runtime/plugin support, physical devices and external adopters are not claimed.
