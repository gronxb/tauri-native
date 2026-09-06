# [M3] Generate host TypeScript contracts from existing Rust commands

## Outcome

invoke<T> currently lets callers invent command/result types. Generate useful host contracts without requiring producer schemas, a second registry, or custom Rust derives.

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
- Depends on: [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8), [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13)
- Planned against: [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac), 2026-09-05
- Local plan: `plans/010-generated-command-types.md`
- Issue: [#14](https://github.com/gronxb/tauri-native/issues/14)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Status: IMPLEMENTED — native serialization parity, portable exports and packed-consumer type gates passed; merge pending.

Effort is relative: S = hours, M = roughly one to a few working days, L = multiple days or investigation. These are not deadlines. Confirm estimates after M0.

## Current state and evidence

- [`packages/react-native/src/invoke.ts:12`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/react-native/src/invoke.ts#L12): Accepts arbitrary command/string payload and casts the result.
- [`packages/lynx/src/index.ts:26`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/packages/lynx/src/index.ts#L26): Same unchecked generic API.
- [`examples/tauri/src-tauri/crates/app-core/src/lib.rs:224`](https://github.com/gronxb/tauri-native/blob/117e887977a878aa4734f2df7ab2cca0670014ac/examples/tauri/src-tauri/crates/app-core/src/lib.rs#L224): Current dispatcher manually lists commands.

Representative current source:

```
command: string,
payload: Record<string, unknown>
```

Before implementation, inspect `git diff 117e887..HEAD -- packages/react-native/src/invoke.ts packages/lynx/src/index.ts examples/tauri/src-tauri/crates/app-core/src/lib.rs` and reconcile this plan with completed dependencies. Expected dependency changes are not themselves a blocker; an incompatible architectural/product-contract change is.

## Scope

- packages/cli/src/discovery/ and type emission
- packages/cli/src/artifacts/
- packages/cli/test/ type fixtures
- packages/cli/package.json
- packages/react-native/src/ typed host API
- packages/lynx/src/ and types/ typed host API
- CLI/host docs

Out of scope: unrelated refactors, additional host platforms, a full Tauri runtime/plugin replacement, OTA delivery, a hosted artifact service, and mandatory application-authored integration code. Only change adjacent files when directly required by this issue and explain why.

## Implementation steps

1. Reuse the discovered model and M0-approved extraction. Determine the accurately representable Rust/serde subset without producer source changes.

2. Emit command names, argument/result contracts and typed host bindings into the artifact. RN/Lynx consume them; the ordinary frontend keeps its existing @tauri-apps/api imports.

3. Handle serde names/tagged enums/option-null, unit/Result semantics and integer range policy explicitly. Custom serializers or opaque types yield honest unknown/unsupported diagnostics, not guessed layouts.

4. Add test:types with positive/negative compilation fixtures and serialization parity. Unsupported advanced typed output must not unnecessarily block the otherwise valid untyped export path.

Run the fixture or baseline relevant to each completed step before proceeding; the final gates below must all have evidence.

## Verification

Commands marked **New gate to add** are deliverables of this issue, not commands claimed to exist today. Gates from previous milestones are prerequisites. Native gates require the documented toolchain plus a built/installed test host. Run Node package tests from their package scripts, not by globbing every package from the repository root.

| Gate | Command/action | Expected result |
| --- | --- | --- |
| Existing baseline | `nub --cwd packages/cli run test` | Generation/package checks pass. |
| New gate to add | `nub --cwd packages/cli run test:types` | Generated clients compile; invalid commands/payloads trigger expected diagnostics. |
| Existing baseline | `nub --cwd packages/react-native run typecheck && nub --cwd packages/lynx run typecheck` | Both typed APIs compile. |

## Meaningful test scenarios

- Wrong command names and payload shapes fail at compile time.
- Generated serde types match actual Rust JSON.
- Changing command registration regenerates the artifact contract.
- Custom serialization and large integers never silently produce misleading types.

Use current conventions: CLI tests use `node:test` and `node:assert/strict` (e.g. `packages/cli/test/android-artifacts.test.ts`); isolated file fixtures use temporary directories with cleanup; Expo follows `packages/react-native/test/app-plugin.test.js`; native integration uses the existing `.maestro/` flows. Assert actual behavior rather than generated-template snapshots or test counts.

## Acceptance criteria

- [x] Useful types require no new producer derives/macros/schema.
- [x] One model drives dispatch and type output.
- [x] Both hosts consume types from copied artifacts.
- [x] Frontend remains independent of tauri-native bindings.
- [x] Required checks have recorded results; skipped/blocked checks are identified accurately.
- [x] Changes stay within this issue's purpose and preserve the producer change budget.

## Blockers and maintenance

Mandatory producer annotations require an explicit tradeoff decision; preserve the untyped route rather than silently editing source.

This is an export convenience, not an assertion that arbitrary serde implementations can be understood statically.

Use a `codex/generated-command-types` branch if creating one, follow the repository's conventional commit style, and do not commit/push/merge/publish changes without the execution task's authorization. Keep this issue and any checked-in plan status aligned.

## Execution result — 2026-09-07

The Rust parser adds type syntax, explicit imports, root definitions and serde attributes to the existing command model. Generated platform artifacts include checksummed `commands.ts` with a `Commands` map, `createCommands(invoke)` and located `typeDiagnostics`. Both hosts share that copied contract; the ordinary producer/frontend needs no new code. Unsupported or lossy projections remain unknown while untyped native export continues.

`nub --cwd packages/cli run test:types` passes: seventeen real Tauri/native calls agree, observed native JSON satisfies generated success/error types, and registration changes regenerate bindings. All iOS/Android slices export without source changes. After deleting the producer, packed RN and Lynx consumers validate both copied platform directories and compile positive/negative calls without Cargo or rustc on PATH. The wrapper retains the original cancellable request and options. Empty registries compile. Evidence: `target/command-types/report.json`; reproduction and limits: [generated host contracts](../docs/command-types.md).

Final regression checks pass: CLI 33 tests, RN 9, Lynx 2, all package/type checks and the Rust protocol scenario. The artifact receipt rejects a substituted command contract. No native bridge execution code changed in this issue, and no new physical-device or external-adoption evidence is claimed.
