# Tauri export and mobile composition roadmap

[GitHub roadmap #21](https://github.com/gronxb/tauri-native/issues/21) · 9 milestones · 23 implementation issues

Planned on 2026-09-05 against `117e887`. Scope: prove the revised product contract and reach a verified 1.0 release.

**Core value:** an ordinary Tauri project installs the CLI, exports native artifacts, and hands them to a host. It should not maintain our Rust bridge, adopt our crate layout/macros, or import host-specific frontend APIs. The host consumes copied artifacts without the Tauri source checkout or Rust toolchain.

## Tauri Mobile preservation amendment — 2026-09-09

The producer must remain a normal independently runnable Tauri desktop, iOS and Android application. React Native and Lynx are optional composition layers above it. Preserve real Tauri Builder/setup, State, AppHandle, commands, events, mobile plugins and capabilities. The existing limited command adapter is a delivered subset, not the target architecture for this requirement. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

A single platform bootstrap must initialize the actual Tauri app and cooperate with the renderer. The first feasibility candidate retains Tauri Mobile startup and attaches native renderer surfaces; the previous unconditional RN/Lynx lifecycle ownership requirement is superseded. Do not remove Tauri, fabricate its state/handles or bypass permissions to claim compatibility. Producer source independence and artifact-only host consumption remain requirements.

| Milestone | Exit gate | Issues |
| --- | --- | --- |
| [M6 — Prove retained Tauri Mobile composition](https://github.com/gronxb/tauri-native/milestone/7) | Keep an ordinary Tauri Mobile app and actual startup/state/plugins alive while proving RN and Lynx surface coexistence on iOS and Android. One platform bootstrap; unchanged producer source. Baseline execution alone does not close this gate. | [#41](https://github.com/gronxb/tauri-native/issues/41) |
| [M7 — Retain Tauri runtime, plugins and portable artifacts](https://github.com/gronxb/tauri-native/milestone/8) | Preserve Builder setup, State, AppHandle, actual Tauri dispatch, native Swift/Kotlin plugins and capabilities in source-free versioned platform artifacts. | [#42](https://github.com/gronxb/tauri-native/issues/42), [#43](https://github.com/gronxb/tauri-native/issues/43), [#44](https://github.com/gronxb/tauri-native/issues/44) |
| [M8 — Integrate renderers and verify Tauri Mobile parity](https://github.com/gronxb/tauri-native/milestone/9) | Compose RN/Expo and Lynx and pass six mobile combinations against standalone Tauri behavior, including lifecycle, permissions, plugins, relocation and independent adoption. | [#45](https://github.com/gronxb/tauri-native/issues/45), [#46](https://github.com/gronxb/tauri-native/issues/46), [#47](https://github.com/gronxb/tauri-native/issues/47) |

- [x] [#41 — [M6] Prove real Tauri Mobile startup and native renderer coexistence](https://github.com/gronxb/tauri-native/issues/41)
- [ ] [#42 — [M7] Preserve Builder setup, State and AppHandle in generated integration](https://github.com/gronxb/tauri-native/issues/42)
- [ ] [#43 — [M7] Preserve native mobile plugins, permissions and OS callbacks](https://github.com/gronxb/tauri-native/issues/43)
- [ ] [#44 — [M7] Export portable Tauri runtime and plugin artifacts](https://github.com/gronxb/tauri-native/issues/44)
- [ ] [#45 — [M8] Compose React Native and Expo with retained Tauri Mobile](https://github.com/gronxb/tauri-native/issues/45)
- [ ] [#46 — [M8] Compose Lynx with retained Tauri Mobile](https://github.com/gronxb/tauri-native/issues/46)
- [ ] [#47 — [M8] Gate release on standalone and composed Tauri Mobile parity](https://github.com/gronxb/tauri-native/issues/47)

Execution order: #41 establishes standalone real-runtime behavior and mobile renderer coexistence; #42 preserves actual startup/dispatch; #43 adds native plugin and permission lifecycle; #44 packages the runtime/dependencies; #45 and #46 integrate RN/Expo and Lynx; #47 gates parity in all six mobile combinations. #41 is DONE: on 2026-09-09 the real desktop/iOS/Android baseline, all four RN/Lynx native UI/lifecycle combinations, serialized harness rechecks and independent Tauri execution after integration removal passed. ADR 0007 accepts the scoped Tauri-driven composition architecture; production M7–M8 gates remain open. See the evidence in #41. Desktop-only APIs keep upstream platform restrictions. Support for third-party plugins requires an explicit verified matrix.

M0–M5 and 1.0.0-rc.0 evidence remain valid for the previously documented subset. Mobile-composition readiness now additionally requires M6–M8, and stable release tracking in #20 must distinguish that new requirement from the completed candidate work. Physical-device execution and independent onboarding remain open. No new package release is authorized by this amendment. Implementation proceeds directly on main in incremental commits without PRs.

## Original milestones

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
| [011](011-view-context-events.md) | [#15 — [M3] Connect host view lifecycle and scoped frontend interaction](https://github.com/gronxb/tauri-native/issues/15) | P2 | L | 007, 008, 009 | DONE · PR #32 merged |
| [012](012-doctor-artifact-diagnostics.md) | [#16 — [M4] Diagnose toolchains, unsupported projects, and artifact mismatches](https://github.com/gronxb/tauri-native/issues/16) | P2 | M | 003, 005, 006, 007 | DONE · PR #33 merged |
| [013](013-incremental-export-watch.md) | [#17 — [M4] Refresh exports with correct caching and a watch workflow](https://github.com/gronxb/tauri-native/issues/17) | P2 | L | 012 | DONE · PR #34 merged |
| [014](014-real-feature-independent-consumers.md) | [#18 — [M5] Demonstrate a useful Tauri feature in independent mobile hosts](https://github.com/gronxb/tauri-native/issues/18) | P1 | L | 009, 010, 011, 013 | DONE · PR #35 |
| [015](015-native-compatibility-ci.md) | [#19 — [M5] Gate changes with native, compatibility, and package verification](https://github.com/gronxb/tauri-native/issues/19) | P1 | L | 002, 007, 008, 009, 010, 011, 013, 014 | DONE · PR #36 merged |
| [016](016-onboarding-1-0-release.md) | [#20 — [M5] Validate independent onboarding and prepare the 1.0 release](https://github.com/gronxb/tauri-native/issues/20) | P1 | M | 014, 015 | IN PROGRESS · PR #37 merged; RC CI passed; device/adoption gates open |
| [017](017-tauri-mobile-runtime-proof.md) | [#41 — [M6] Prove real Tauri Mobile startup and native renderer coexistence](https://github.com/gronxb/tauri-native/issues/41) | P1 | L | M0–M5 baseline | DONE · scoped Tauri-driven architecture GO |
| [018](018-retained-tauri-dispatch.md) | [#42 — [M7] Preserve Builder setup, State and AppHandle in generated integration](https://github.com/gronxb/tauri-native/issues/42) | P1 | L | 017 | IN PROGRESS · desktop and all four mobile dispatch gates passed |
| [019](019-mobile-plugin-lifecycle.md) | [#43 — [M7] Preserve native mobile plugins, permissions and OS callbacks](https://github.com/gronxb/tauri-native/issues/43) | P1 | L | 017, 018 | IN PROGRESS · standalone iOS/Android and Android native artifact plugins pass |
| [020](020-runtime-portable-artifacts.md) | [#44 — [M7] Export portable Tauri runtime and plugin artifacts](https://github.com/gronxb/tauri-native/issues/44) | P1 | L | 018, 019 | IN PROGRESS · Android ABI 3 source-free native execution passes |
| [021](021-react-native-tauri-composition.md) | [#45 — [M8] Compose React Native and Expo with retained Tauri Mobile](https://github.com/gronxb/tauri-native/issues/45) | P1 | L | 017, 020 | TODO |
| [022](022-lynx-tauri-composition.md) | [#46 — [M8] Compose Lynx with retained Tauri Mobile](https://github.com/gronxb/tauri-native/issues/46) | P1 | L | 017, 020 | TODO |
| [023](023-tauri-mobile-composition-acceptance.md) | [#47 — [M8] Gate release on standalone and composed Tauri Mobile parity](https://github.com/gronxb/tauri-native/issues/47) | P1 | L | 019, 021, 022 | TODO |

M1 follows the M0 decision. M2 requires portable artifacts. M3 builds real command behavior on working host integrations. M4 can overlap later M2/M3 work where issue dependencies allow. The reference feature integrates these capabilities; native/package evidence and independent onboarding gate 1.0.

## Considered and deferred

- Mandatory `app-core` templates or custom producer macros: contradict the revised low-intrusion value; optional legacy support is distinct.
- Unrestricted desktop-only APIs remain outside mobile scope. Actual Tauri Mobile runtime/plugin preservation is required by M6–M8, superseding the former exclusion.
- New host frameworks, OTA, hosted artifact registries, cloud sync and a general plugin/event platform: outside the path to the first validated release.
- Unconditional generated typing for arbitrary serde/custom macro behavior: report the supported subset honestly.
- A finished calculator demo as the release gate: insufficient to establish useful reuse or independent adoption.

## Baseline and plan status

Before this roadmap, Rust core tests (8), CLI tests (9, from its package directory), Expo config-plugin test (1) and package typechecks passed. These were limited baseline results, not native/compatibility certification.

On 2026-09-06, plan 001 was implemented and verified locally. The ordinary producer's synchronous commands pass generated native ABI, real macOS WKWebView, Tauri IPC parity and source-integrity checks. See [ADR 0004](../docs/adr/0004-source-transparent-export-spike.md) and the plan's execution result. CLI tests/package/type checks and Rust core tests also passed. This is a scoped feasibility go; mobile artifacts and general runtime compatibility are still pending. Delivered in [PR #22](https://github.com/gronxb/tauri-native/pull/22), merged into `main` as `bb1c3f1`; GitHub #5 is closed.

Each issue is self-contained. New verification scripts are explicitly marked as future deliverables. `github-roadmap.json` records remote IDs/URLs after publication. Plan statuses: TODO, IN PROGRESS, DONE, BLOCKED, REJECTED.
