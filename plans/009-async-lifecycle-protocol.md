# [M3] Add nonblocking invocation with cancellation and teardown semantics

## Outcome

All direct APIs are synchronous; Promise-shaped WebView calls do not by themselves make Rust work nonblocking. Real file/database/long-running commands need bridge-owned execution and lifetime semantics.

## Product contract

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

- No mandatory producer `app-core` layout, custom C ABI/header, tauri-native Rust SDK/macros, second command registry, or host-specific frontend globals/imports.
- CLI installation may update `package.json` and its JS lockfile. Export must preserve authored Rust/frontend files, Cargo manifests/lockfiles, command registration, and Tauri configuration; generated ignored intermediates/artifacts are disposable.
- The mobile host owns lifecycle. Existing Tauri APIs are supported only for an explicitly verified subset; no silent emulation of unsupported runtime/plugin/state behavior.
- A source-transparent export is an M0 feasibility gate, not an assumption that every Tauri application can already be exported.

## Status and ordering

- Milestone: [M3 — Real commands and host interaction](https://github.com/gronxb/tauri-native/milestone/4)
- Priority: **P1** · Effort: **L** · Implementation risk: **HIGH**
- Category: direction
- Depends on: [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8), [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11), [#12 — [M2] Bring Lynx to the same artifact-only integration contract](https://github.com/gronxb/tauri-native/issues/12)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/009-async-lifecycle-protocol.md`
- Issue: [#13](https://github.com/gronxb/tauri-native/issues/13)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: IMPLEMENTED — native and package gates passed; merge pending.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/react-native/src/NativeTauri.ts:3`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/src/NativeTauri.ts#L3): Synchronous string-to-string TurboModule.
- [`packages/react-native/ios/TNTauriWebView.swift:192`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/ios/TNTauriWebView.swift#L192): Incoming messages synchronously invoke Rust.
- [`packages/lynx/src/index.ts:26`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/lynx/src/index.ts#L26): Lynx also returns synchronously.

Representative current source:

```
invoke(command: string, payloadJson: string): string;
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/react-native/src/NativeTauri.ts packages/react-native/ios/TNTauriWebView.swift packages/lynx/src/index.ts` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/ generated adapter/protocol and fixtures
- packages/react-native/src/, cpp/, ios/, android/
- packages/lynx/src/, generated/, types/, ios/, android/
- examples/react-native/.maestro/
- examples/lynx/.maestro/
- docs/compatibility.md
- host API docs

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Specify request IDs/runtime generations, queues, concurrency/task ownership, cancellation and shutdown. State whether cancellation cooperatively stops work or only suppresses delivery; do not claim arbitrary Rust code is preemptible.

2. Implement supported async commands in the generated adapter and Promise-based host APIs. Move actual blocking work off UI/JS threads and dispatch callbacks onto the correct runtime thread without a second app owner.

3. Preserve ordinary Tauri invoke success/rejection in the frontend. Define migration for synchronous host APIs and version the artifact ABI.

4. Handle cancellation/completion races, unmount/remount, runtime reload, late/out-of-order callbacks and errors exactly once. Test deliberately slow commands and observable side effects.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Adapter/protocol tests pass. |
| Existing baseline | `nub --cwd packages/react-native run typecheck && nub --cwd packages/lynx run typecheck` | Both exit 0. |
| Native gates from M2 | `nub --cwd examples/react-native run test:e2e:ios && nub --cwd examples/react-native run test:e2e:android` | Slow work does not freeze the UI; lifecycle tests pass. |
| Native gates from M2 | `nub --cwd examples/lynx run test:e2e:ios && nub --cwd examples/lynx run test:e2e:android` | Equivalent Lynx scheduling/lifetime behavior. |

## Meaningful test scenarios

- UI remains interactive during real delayed Rust work.
- Concurrent out-of-order results route to correct requests.
- Cancel/complete races and dead-runtime callbacks settle once without leaks/crashes.
- Domain/transport errors and bounded cleanup work across both transports.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Actual work executes without blocking UI/JS call paths.
- [x] Supported ordinary async commands need no custom producer APIs.
- [x] Cancellation/teardown semantics are documented and tested on all hosts/platforms.
- [x] Incompatible ABI versions fail deterministically.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Promise.resolve around a synchronous native call is insufficient. New producer runtime/annotations or fabricated State semantics require revisiting compatibility.

Host AbortSignal controls can live in host packages. Ordinary Tauri frontend calls may initially cancel only through teardown; do not require custom cancellation imports.

Use a `codex/async-lifecycle-protocol` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Execution result — 2026-09-07

ABI 2 executes owned root sync/async commands on artifact-owned workers and adds bounded request sessions. Both host `invoke` APIs return cancellable Promises; `invokeSync` preserves explicit blocking/legacy use. The ordinary producer frontend retains its Tauri value/rejection API. Host teardown closes sessions and rejects delivery to retired documents/runtimes; running Rust work may still finish with side effects.

The shared native gate replaces the calculator-only M2 flows for async acceptance: `nub --cwd packages/cli run test:export:async`, followed by [the independent-host lifecycle instructions](../docs/testing-async.md). All four Release flows pass, including interaction during delayed work, cancellation, remount, page reload and real native runtime replacement. The original ABI 0 calculator flows also pass on all four host/platform combinations. Package/type checks, Rust protocol tests, portable artifact exports and macOS Tauri/native parity pass. The producer source/frontend hashes are preserved, and independent host builds use no Rust toolchain.

[ADR 0005](../docs/adr/0005-async-request-sessions.md) records versions, report paths and the scoped R8 result. Full Lynx example minification remains a separate #19 check because optional framework dependencies are absent; neither physical-device execution nor external adoption is claimed.
