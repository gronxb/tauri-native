# [M6] Prove real Tauri Mobile startup and native renderer coexistence

## Outcome

Keep a normal Tauri Mobile app running with its actual state, setup, IPC and plugin machinery, then establish one native lifecycle owner while attaching RN and Lynx.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — establishing the real-runtime baseline; mobile composition is unproven.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: existing M0–M5 evidence; this is the new feasibility gate
- Issue: [#41](https://github.com/gronxb/tauri-native/issues/41)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/017-tauri-mobile-runtime-proof.md`

## Implementation

1. Add an ordinary Tauri fixture with managed state, AppHandle, setup, async commands, plugin initialization, Rust events and allow/deny capabilities. No host imports or synthetic Tauri runtime.
2. Add an executable real-Wry baseline with source hashing and assertion-bearing evidence; build/run standalone iOS and Android copies through the standard Tauri toolchain.
3. Prototype native renderer attachment on iOS and Android. Exercise one RN and one Lynx surface, background/resume and unmount/remount while the Tauri state remains alive.
4. Record actual platform startup/callback ownership and a go/no-go ADR. If a host-driven approach fails, investigate the Tauri-driven composition candidate without changing the producer.

## Meaningful verification

- Actual setup executes once and shared state survives repeated command calls and renderer remounts.
- An allowed plugin command executes; a denied command cannot execute its side effect.
- The same unchanged frontend receives a Rust event and the original command error.
- Standalone Tauri still runs after generated integration is deleted.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] Real baseline executes on desktop and on iOS/Android.
- [ ] RN and Lynx coexistence and lifecycle are proved on both mobile platforms.
- [ ] Source hashes, tool versions, logs and an architectural decision are recorded.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
