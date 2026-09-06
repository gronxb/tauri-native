# [M5] Demonstrate a useful Tauri feature in independent mobile hosts

## Outcome

The calculator proves transport but not adoption value. A small document save/search feature can demonstrate domain and frontend reuse with native mobile navigation.

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
- Depends on: [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13), [#14 — [M3] Generate host TypeScript contracts from existing Rust commands](https://github.com/gronxb/tauri-native/issues/14), [#15 — [M3] Connect host view lifecycle and scoped frontend interaction](https://github.com/gronxb/tauri-native/issues/15), [#17 — [M4] Refresh exports with correct caching and a watch workflow](https://github.com/gronxb/tauri-native/issues/17)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/014-real-feature-independent-consumers.md`
- Issue: [#18](https://github.com/gronxb/tauri-native/issues/18)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: DONE — ordinary Fieldnotes producer, six packed Release consumers and controlled Rust-change/pending-navigation evidence in [PR #35](https://github.com/gronxb/tauri-native/pull/35).

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`examples/tauri/src-tauri/src/lib.rs:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/src/lib.rs#L1): Current command is a bridge-tailored calculator adapter.
- [`examples/tauri/src/main.ts:12`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src/main.ts#L12): Frontend identifies the host with a custom global.
- [`examples/react-native/src/App.tsx:1`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/react-native/src/App.tsx#L1): Mobile example combines a direct-call surface and embedded view.

Representative current source:

```
__TAURI_NATIVE_HOST__?: 'react-native' | 'lynx';
```

Before implementation, inspect `git diff 117e887..HEAD -- examples/tauri/src-tauri/src/lib.rs examples/tauri/src/main.ts examples/react-native/src/App.tsx` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- examples/tauri/ or new examples/ordinary-tauri-feature/ (choose one canonical example)
- examples/react-native/
- examples/lynx/
- packages/cli/test/native-export/ external-consumer harness
- packages/cli/package.json
- README.md
- docs/examples/ (new)

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Implement one narrow flow: save a local document and search saved text in Rust with a normal Tauri frontend. No accounts/cloud/sync service or full document-product scope.

2. Keep producer code ordinary using only M0/M3-supported standard mechanisms. No custom bridge core/layout/ABI/annotations/globals or RN/Lynx branches; desktop remains independently runnable.

3. Integrate via copied artifacts in independent RN/Expo and Lynx hosts, showing native navigation/direct calls and the embedded feature. If persistence/state initialization is still unsupported, report that blocker rather than hiding a custom runtime.

4. Add test:external-consumer using packed candidate packages in temp projects outside the monorepo: no workspace aliases or source access during host compilation. Record setup, source reuse and measured build/size/startup costs.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| New gate to add | `nub --cwd packages/cli run test:external-consumer` | Fresh consumers use packed packages and copied artifacts without workspace shortcuts. |
| Native gates from M2 | `nub --cwd examples/react-native run test:e2e:ios && nub --cwd examples/react-native run test:e2e:android` | Save/search/relaunch/navigation and both transports pass. |
| Native gates from M2 | `nub --cwd examples/lynx run test:e2e:ios && nub --cwd examples/lynx run test:e2e:android` | Equivalent Lynx behavior. |
| Producer gate to record | Add and record the canonical example's standard Tauri desktop build/test commands in its package.json and walkthrough. | Same frontend/domain behavior passes independently on desktop. |

## Meaningful test scenarios

- Save, terminate/relaunch, search by content; errors remain visible.
- Search does not freeze the host and can be abandoned by leaving the view.
- One Rust behavior change appears on desktop and both mobile hosts after export.
- Host builds after the producer checkout is removed from the consumer environment.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Example demonstrates useful reuse beyond arithmetic.
- [x] No producer bridge-specific code is needed.
- [x] Packed external consumers pass on both hosts/platforms.
- [x] Measurements and integration tradeoffs are recorded honestly.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Unsupported state/plugin requirements must feed back into compatibility scope, not become hidden producer coupling.

Remove obsolete tailored demo scaffolding only when this replacement makes it unnecessary. Focus on one feature.

Use a `codex/real-feature-independent-consumers` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Recorded completion

The [Fieldnotes walkthrough and measurements](../docs/examples/fieldnotes.md#recorded-local-results-2026-09-07) record both native matrices, the changed-run harness intervention and the final unattended original-code run. All native consumers used copied artifacts and independently installed packages with Rust absent from their build PATH. Desktop Release build, three document scenarios, package/unit/type checks and actual Tauri path/event protocol checks passed. Physical execution and independent adoption are not claimed by this example gate.
