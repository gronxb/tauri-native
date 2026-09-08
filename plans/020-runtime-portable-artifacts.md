# [M7] Export portable Tauri runtime and plugin artifacts

## Outcome

Preserve artifact-only consumption while carrying the real Tauri mobile runtime and its native dependencies.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: TODO
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#42](https://github.com/gronxb/tauri-native/issues/42) (plan 018), [#43](https://github.com/gronxb/tauri-native/issues/43) (plan 019)
- Issue: [#44](https://github.com/gronxb/tauri-native/issues/44)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/020-runtime-portable-artifacts.md`

## Implementation

1. Version the artifact/runtime contract so limited-adapter artifacts cannot be mistaken for retained-runtime artifacts.
2. Export Rust libraries, native runtime/plugin code or binaries, resources, framework/Gradle dependencies, configuration, capabilities and generated host contracts.
3. Generate source-free Pod/Gradle integration with explicit app bootstrap requirements and deterministic conflict diagnostics.
4. Validate integrity, architecture, ABI, dependency resolution and relocation; keep atomic publication and incremental invalidation.

## Meaningful verification

- Copy to a path with spaces, delete the producer and build without Rust in PATH.
- Change a capability or native plugin dependency and verify cache invalidation.
- Incompatible runtime version, missing resource and lifecycle configuration conflict fail before loading.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [ ] Both platform exports contain everything needed by independent consumers.
- [ ] Old and new artifact modes are explicitly distinguished and migration is documented.
- [ ] No producer absolute paths or implicit source rebuilds remain.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
