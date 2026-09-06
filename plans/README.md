# CLI-only Tauri export roadmap

[GitHub roadmap #21](https://github.com/gronxb/tauri-native/issues/21) · 6 milestones · 16 implementation issues

Planned on 2026-09-05 against `117e887`. Scope: prove the revised product contract and reach a verified 1.0 release.

**Core value:** an ordinary Tauri project installs the CLI, exports native artifacts, and hands them to a host. It should not maintain our Rust bridge, adopt our crate layout/macros, or import host-specific frontend APIs. The host consumes copied artifacts without the Tauri source checkout or Rust toolchain.

## Milestones

### [M0 — Prove source-transparent Tauri export](https://github.com/gronxb/tauri-native/milestone/1)

Gate: prove native execution of existing registered Tauri commands without application-authored bridge code or a second application runtime. Define the supported subset and source-integrity fixtures. If infeasible, block dependent implementation and report the smallest required concession.

### [M1 — CLI-only portable native artifacts](https://github.com/gronxb/tauri-native/milestone/2)

Gate: install the CLI in an ordinary Tauri project and export relocatable iOS XCFramework/assets and Android libraries/assets. Discovery, adapters, ABI, and metadata are tool-owned. No mandatory app-core, header, custom macros, or host-specific frontend imports.

### [M2 — Drop-in artifacts for React Native and Lynx](https://github.com/gronxb/tauri-native/milestone/3)

Gate: RN/Expo and Lynx consume only copied platform artifacts plus their host package. No access to the producer source or Rust build toolchain is needed for the host build. Verify direct and embedded calls on iOS and Android.

### [M3 — Real commands and host interaction](https://github.com/gronxb/tauri-native/milestone/4)

Gate: nonblocking commands, explicit cancellation/teardown semantics, generated host TypeScript contracts, and a narrow host/frontend interaction surface. The producer continues using ordinary Tauri APIs.

### [M4 — Short and diagnosable development workflow](https://github.com/gronxb/tauri-native/milestone/5)

Gate: diagnose setup/config/artifact mismatches before expensive builds; refresh exports with correct invalidation and accurate host rebuild instructions. Preserve the portable-artifact boundary.

### [M5 — Validate adoption and ship 1.0](https://github.com/gronxb/tauri-native/milestone/6)

Gate: one useful feature shared by independent desktop/mobile apps, native/compatibility/package CI, and independent onboarding evidence. Stable release covers only the verified support matrix, not arbitrary Tauri runtime/plugin compatibility.

No due dates or assignees are invented. M0 is a go/no-go gate. A failed proof blocks downstream implementation until the maintainer chooses the smallest acceptable concession.

## Execution order

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-source-transparent-export-spike.md) | [#5 — [M0] Prove export from an unmodified Tauri project](https://github.com/gronxb/tauri-native/issues/5) | P1 | L | — | DONE · PR #22 merged |
| [002](002-compatibility-source-integrity.md) | [#6 — [M0] Define compatibility and source-integrity acceptance fixtures](https://github.com/gronxb/tauri-native/issues/6) | P1 | M | 001 | DONE · PR #23 merged |
| [003](003-project-command-discovery.md) | [#7 — [M1] Discover ordinary Tauri projects and registered commands](https://github.com/gronxb/tauri-native/issues/7) | P1 | L | 001, 002 | DONE ([PR #24](https://github.com/gronxb/tauri-native/pull/24), merged) |
| [004](004-generated-native-adapter.md) | [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8) | P1 | L | 003 | DONE ([PR #24](https://github.com/gronxb/tauri-native/pull/24), merged) |
| [005](005-portable-ios-artifacts.md) | [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9) | P1 | L | 004 | DONE · PR #25 merged |
| [006](006-portable-android-artifacts.md) | [#10 — [M1] Export equivalent portable Android libraries and assets](https://github.com/gronxb/tauri-native/issues/10) | P1 | L | 004, 005 | DONE · PR #26 merged |
| [007](007-react-native-artifact-consumption.md) | [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11) | P1 | L | 005, 006 | DONE · PR #27 merged |
| [008](008-lynx-artifact-parity.md) | [#12 — [M2] Bring Lynx to the same artifact-only integration contract](https://github.com/gronxb/tauri-native/issues/12) | P1 | M | 005, 006, 007 | DONE · PR #29 merged |
| [009](009-async-lifecycle-protocol.md) | [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13) | P1 | L | 004, 007, 008 | DONE · PR #30 merged |
| [010](010-generated-command-types.md) | [#14 — [M3] Generate host TypeScript contracts from existing Rust commands](https://github.com/gronxb/tauri-native/issues/14) | P1 | L | 004, 009 | DONE · PR #31 merged |
| [011](011-view-context-events.md) | [#15 — [M3] Connect host view lifecycle and scoped frontend interaction](https://github.com/gronxb/tauri-native/issues/15) | P2 | L | 007, 008, 009 | VERIFIED · ready for PR |
| [012](012-doctor-artifact-diagnostics.md) | [#16 — [M4] Diagnose toolchains, unsupported projects, and artifact mismatches](https://github.com/gronxb/tauri-native/issues/16) | P2 | M | 003, 005, 006, 007 | TODO |
| [013](013-incremental-export-watch.md) | [#17 — [M4] Refresh exports with correct caching and a watch workflow](https://github.com/gronxb/tauri-native/issues/17) | P2 | L | 012 | TODO |
| [014](014-real-feature-independent-consumers.md) | [#18 — [M5] Demonstrate a useful Tauri feature in independent mobile hosts](https://github.com/gronxb/tauri-native/issues/18) | P1 | L | 009, 010, 011, 013 | TODO |
| [015](015-native-compatibility-ci.md) | [#19 — [M5] Gate changes with native, compatibility, and package verification](https://github.com/gronxb/tauri-native/issues/19) | P1 | L | 002, 007, 008, 009, 010, 011, 013, 014 | TODO |
| [016](016-onboarding-1-0-release.md) | [#20 — [M5] Validate independent onboarding and prepare the 1.0 release](https://github.com/gronxb/tauri-native/issues/20) | P1 | M | 014, 015 | TODO |

M1 follows the M0 decision. M2 requires portable artifacts. M3 builds real command behavior on working host integrations. M4 can overlap later M2/M3 work where issue dependencies allow. The reference feature integrates these capabilities; native/package evidence and independent onboarding gate 1.0.

## Considered and deferred

- Mandatory `app-core` templates or custom producer macros: contradict the revised low-intrusion value; optional legacy support is distinct.
- Full Tauri runtime/plugin/window compatibility: not proven and conflicts with the current single-owner lifecycle design.
- New host frameworks, OTA, hosted artifact registries, cloud sync and a general plugin/event platform: outside the path to the first validated release.
- Unconditional generated typing for arbitrary serde/custom macro behavior: report the supported subset honestly.
- A finished calculator demo as the release gate: insufficient to establish useful reuse or independent adoption.

## Baseline and plan status

Before this roadmap, Rust core tests (8), CLI tests (9, from its package directory), Expo config-plugin test (1) and package typechecks passed. These were limited baseline results, not native/compatibility certification.

On 2026-09-06, plan 001 was implemented and verified locally. The ordinary producer's synchronous commands pass generated native ABI, real macOS WKWebView, Tauri IPC parity and source-integrity checks. See [ADR 0004](../docs/adr/0004-source-transparent-export-spike.md) and the plan's execution result. CLI tests/package/type checks and Rust core tests also passed. This is a scoped feasibility go; mobile artifacts and general runtime compatibility are still pending. Delivered in [PR #22](https://github.com/gronxb/tauri-native/pull/22), merged into `main` as `bb1c3f1`; GitHub #5 is closed.

Each issue is self-contained. New verification scripts are explicitly marked as future deliverables. `github-roadmap.json` records remote IDs/URLs after publication. Plan statuses: TODO, IN PROGRESS, DONE, BLOCKED, REJECTED.
