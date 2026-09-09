# Tauri Mobile preservation and native composition — path to 1.0

## North star

tauri-native provides an artifact-based integration workflow for existing Tauri applications. Within the documented compatibility scope, developers install the CLI, export platform binaries and frontend assets, and integrate the resulting artifacts into a native host. The CLI and host packages own the required adaptation, so the Tauri application does not need host-specific dependencies, bridge code, or a custom project layout.

This tracker covers the existing limited-adapter candidate and the added Tauri Mobile composition requirement through a verified 1.0 release. The repository baseline is [`117e887`](https://github.com/gronxb/tauri-native/commit/117e887977a878aa4734f2df7ab2cca0670014ac); this roadmap was created on 2026-09-05. Tasks are ordered by evidence and dependencies, not invented calendar deadlines.

## Target experience

Producer, in an otherwise ordinary Tauri project:

```sh
npm install --save-dev @tauri-native/cli@experimental
npx tauri-native export ios
npx tauri-native export android
```

The published `1.0.0-rc.0` experimental candidate implements this workflow within the [documented compatibility scope](https://github.com/gronxb/tauri-native/blob/1fbb5a347ba7e45fe956922353f327abaeda6fde/docs/compatibility.md), without producer-authored bridge code. All three matching packages are available on npm; pin `1.0.0-rc.0` for reproducible evaluations. See [main validation and publication](https://github.com/gronxb/tauri-native/actions/runs/34133681385) and [verified results in #20](https://github.com/gronxb/tauri-native/issues/20).

The producer hands over one exported platform directory. iOS contains an XCFramework plus its frontend bundle/integration metadata; Android contains normalized native libraries plus frontend assets. Both have a versioned manifest. The mobile host installs its matching bridge package and references the copied artifact. **No producer checkout or Rust toolchain is required during host compilation.**

## Non-negotiable acceptance contract

| Area | Required outcome |
| --- | --- |
| Producer source | No mandatory `app-core` layout, manual dispatcher/C ABI/header, custom tauri-native Rust dependency/macros, or second command registry. |
| Producer frontend | Existing ordinary Tauri/web APIs; no mandatory tauri-native imports, RN/Lynx branches, or `__TAURI_NATIVE_HOST__` checks. |
| Change budget | CLI installation/removal may update JS package metadata/lockfile. Export preserves authored Rust/frontend, Cargo manifests/lockfiles, registration, and Tauri config. Generated ignored intermediates/artifacts are disposable. |
| Command behavior | Preserve command names, serde input/output, Result success/rejection, and the explicitly supported async/state semantics. Diagnose unsupported cases instead of silently substituting behavior. |
| Runtime ownership | One platform bootstrap initializes the actual Tauri app and cooperates with RN/Lynx rendering. Preserve native lifecycle and plugin callbacks; no competing application/event loop. See the M6–M8 amendment. |
| Portability | Copy artifacts to an unrelated host, make producer source inaccessible, and still build/run both direct and embedded calls. |
| Evidence | Hash authored source before/after successful and failed exports. Verify native execution and isolated packed-package consumers, not only generated text. |

Source-preserving export passed the M0 feasibility gate and is implemented in the candidate. The CLI owns generated adaptation; an optional legacy/manual integration route is not required for this workflow.

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

M7 implementation is in progress: #42 has real desktop and Android Lynx native dispatch evidence with explicit caller grants and original Tauri capability checks. Package-owned C/JNI sessions preserve the original Tauri bootstrap. #43 now has an ordinary official-plugin location-note fixture and assertion-bearing mobile permission/lifecycle gates; its desktop independence passes, while mobile plugin executions remain pending. No M7–M8 issue is closed from compilation or a partial native run.

M0–M5 and 1.0.0-rc.0 evidence remain valid for the previously documented subset. Mobile-composition readiness now additionally requires M6–M8, and stable release tracking in #20 must distinguish that new requirement from the completed candidate work. Physical-device execution and independent onboarding remain open. No new package release is authorized by this amendment. Implementation proceeds directly on main in incremental commits without PRs.

## Original M0–M5 milestones and evidence

| Milestone | Exit gate | Implementation issues |
| --- | --- | --- |
| [M0 — Prove source-transparent Tauri export](https://github.com/gronxb/tauri-native/milestone/1) | prove native execution of existing registered Tauri commands without application-authored bridge code or a second application runtime. Define the supported subset and source-integrity fixtures. If infeasible, block dependent implementation and report the smallest required concession. | [#5](https://github.com/gronxb/tauri-native/issues/5), [#6](https://github.com/gronxb/tauri-native/issues/6) |
| [M1 — CLI-only portable native artifacts](https://github.com/gronxb/tauri-native/milestone/2) | install the CLI in an ordinary Tauri project and export relocatable iOS XCFramework/assets and Android libraries/assets. Discovery, adapters, ABI, and metadata are tool-owned. No mandatory app-core, header, custom macros, or host-specific frontend imports. | [#7](https://github.com/gronxb/tauri-native/issues/7), [#8](https://github.com/gronxb/tauri-native/issues/8), [#9](https://github.com/gronxb/tauri-native/issues/9), [#10](https://github.com/gronxb/tauri-native/issues/10) |
| [M2 — Drop-in artifacts for React Native and Lynx](https://github.com/gronxb/tauri-native/milestone/3) | RN/Expo and Lynx consume only copied platform artifacts plus their host package. No access to the producer source or Rust build toolchain is needed for the host build. Verify direct and embedded calls on iOS and Android. | [#11](https://github.com/gronxb/tauri-native/issues/11), [#12](https://github.com/gronxb/tauri-native/issues/12) |
| [M3 — Real commands and host interaction](https://github.com/gronxb/tauri-native/milestone/4) | nonblocking commands, explicit cancellation/teardown semantics, generated host TypeScript contracts, and a narrow host/frontend interaction surface. The producer continues using ordinary Tauri APIs. | [#13](https://github.com/gronxb/tauri-native/issues/13), [#14](https://github.com/gronxb/tauri-native/issues/14), [#15](https://github.com/gronxb/tauri-native/issues/15) |
| [M4 — Short and diagnosable development workflow](https://github.com/gronxb/tauri-native/milestone/5) | diagnose setup/config/artifact mismatches before expensive builds; refresh exports with correct invalidation and accurate host rebuild instructions. Preserve the portable-artifact boundary. | [#16](https://github.com/gronxb/tauri-native/issues/16), [#17](https://github.com/gronxb/tauri-native/issues/17) |
| [M5 — Validate adoption and ship 1.0](https://github.com/gronxb/tauri-native/milestone/6) | one useful feature shared by independent desktop/mobile apps, native/compatibility/package CI, and independent onboarding evidence. Stable release covers only the verified support matrix, not arbitrary Tauri runtime/plugin compatibility. | [#18](https://github.com/gronxb/tauri-native/issues/18), [#19](https://github.com/gronxb/tauri-native/issues/19), [#20](https://github.com/gronxb/tauri-native/issues/20) |

M0 must produce a **go/no-go** result. Do not promise automatic export of arbitrary `AppHandle`, `State`, plugin, window, macro, or custom-serialization behavior before it is demonstrated. If source-transparent export is infeasible, block dependent implementation and present the smallest required concession to the maintainer. Do not silently redefine success as manual core extraction.

## Work checklist

### M0 — Prove source-transparent Tauri export

- [x] [#5 — [M0] Prove export from an unmodified Tauri project](https://github.com/gronxb/tauri-native/issues/5)
- [x] [#6 — [M0] Define compatibility and source-integrity acceptance fixtures](https://github.com/gronxb/tauri-native/issues/6)

### M1 — CLI-only portable native artifacts

- [x] [#7 — [M1] Discover ordinary Tauri projects and registered commands](https://github.com/gronxb/tauri-native/issues/7)
- [x] [#8 — [M1] Generate the native command adapter and own the C ABI](https://github.com/gronxb/tauri-native/issues/8)
- [x] [#9 — [M1] Export a relocatable iOS XCFramework and frontend bundle](https://github.com/gronxb/tauri-native/issues/9)
- [x] [#10 — [M1] Export equivalent portable Android libraries and assets](https://github.com/gronxb/tauri-native/issues/10)

### M2 — Drop-in artifacts for React Native and Lynx

- [x] [#11 — [M2] Let React Native and Expo consume copied artifacts only](https://github.com/gronxb/tauri-native/issues/11)
- [x] [#12 — [M2] Bring Lynx to the same artifact-only integration contract](https://github.com/gronxb/tauri-native/issues/12)

### M3 — Real commands and host interaction

- [x] [#13 — [M3] Add nonblocking invocation with cancellation and teardown semantics](https://github.com/gronxb/tauri-native/issues/13)
- [x] [#14 — [M3] Generate host TypeScript contracts from existing Rust commands](https://github.com/gronxb/tauri-native/issues/14)
- [x] [#15 — [M3] Connect host view lifecycle and scoped frontend interaction](https://github.com/gronxb/tauri-native/issues/15)

### M4 — Short and diagnosable development workflow

- [x] [#16 — [M4] Diagnose toolchains, unsupported projects, and artifact mismatches](https://github.com/gronxb/tauri-native/issues/16)
- [x] [#17 — [M4] Refresh exports with correct caching and a watch workflow](https://github.com/gronxb/tauri-native/issues/17)

### M5 — Validate adoption and ship 1.0

- [x] [#18 — [M5] Demonstrate a useful Tauri feature in independent mobile hosts](https://github.com/gronxb/tauri-native/issues/18)
- [x] [#19 — [M5] Gate changes with native, compatibility, and package verification](https://github.com/gronxb/tauri-native/issues/19)
- [ ] [#20 — [M5] Validate independent onboarding and prepare the 1.0 release](https://github.com/gronxb/tauri-native/issues/20)

## Dependency order

| Issue | Requires | Reason |
| --- | --- | --- |
| [#5](https://github.com/gronxb/tauri-native/issues/5) | — | Prove feasibility before implementation. |
| [#6](https://github.com/gronxb/tauri-native/issues/6) | [#5](https://github.com/gronxb/tauri-native/issues/5) | Turn the proof into a normative contract. |
| [#7](https://github.com/gronxb/tauri-native/issues/7) | [#5](https://github.com/gronxb/tauri-native/issues/5), [#6](https://github.com/gronxb/tauri-native/issues/6) | Discover within the approved source/compatibility boundaries. |
| [#8](https://github.com/gronxb/tauri-native/issues/8) | [#7](https://github.com/gronxb/tauri-native/issues/7) | Generate from the single discovered command model. |
| [#9](https://github.com/gronxb/tauri-native/issues/9) | [#8](https://github.com/gronxb/tauri-native/issues/8) | Package the generated native implementation. |
| [#10](https://github.com/gronxb/tauri-native/issues/10) | [#8](https://github.com/gronxb/tauri-native/issues/8), [#9](https://github.com/gronxb/tauri-native/issues/9) | Reuse the adapter and shared artifact manifest. |
| [#11](https://github.com/gronxb/tauri-native/issues/11) | [#9](https://github.com/gronxb/tauri-native/issues/9), [#10](https://github.com/gronxb/tauri-native/issues/10) | Consume both platform exports without source access. |
| [#12](https://github.com/gronxb/tauri-native/issues/12) | [#9](https://github.com/gronxb/tauri-native/issues/9), [#10](https://github.com/gronxb/tauri-native/issues/10), [#11](https://github.com/gronxb/tauri-native/issues/11) | Prove both hosts share one producer contract. |
| [#13](https://github.com/gronxb/tauri-native/issues/13) | [#8](https://github.com/gronxb/tauri-native/issues/8), [#11](https://github.com/gronxb/tauri-native/issues/11), [#12](https://github.com/gronxb/tauri-native/issues/12) | Add execution/lifetime semantics to real host integrations. |
| [#14](https://github.com/gronxb/tauri-native/issues/14) | [#8](https://github.com/gronxb/tauri-native/issues/8), [#13](https://github.com/gronxb/tauri-native/issues/13) | Generate types for the actual command/async contract. |
| [#15](https://github.com/gronxb/tauri-native/issues/15) | [#11](https://github.com/gronxb/tauri-native/issues/11), [#12](https://github.com/gronxb/tauri-native/issues/12), [#13](https://github.com/gronxb/tauri-native/issues/13) | Build view interaction on proven lifecycle semantics. |
| [#16](https://github.com/gronxb/tauri-native/issues/16) | [#7](https://github.com/gronxb/tauri-native/issues/7), [#9](https://github.com/gronxb/tauri-native/issues/9), [#10](https://github.com/gronxb/tauri-native/issues/10), [#11](https://github.com/gronxb/tauri-native/issues/11) | Diagnose real discovery and artifact requirements. |
| [#17](https://github.com/gronxb/tauri-native/issues/17) | [#16](https://github.com/gronxb/tauri-native/issues/16) | Use validated fingerprints/diagnostics for incremental export. |
| [#18](https://github.com/gronxb/tauri-native/issues/18) | [#13](https://github.com/gronxb/tauri-native/issues/13), [#14](https://github.com/gronxb/tauri-native/issues/14), [#15](https://github.com/gronxb/tauri-native/issues/15), [#17](https://github.com/gronxb/tauri-native/issues/17) | Exercise real behavior with independent consumers. |
| [#19](https://github.com/gronxb/tauri-native/issues/19) | [#6](https://github.com/gronxb/tauri-native/issues/6), [#11](https://github.com/gronxb/tauri-native/issues/11), [#12](https://github.com/gronxb/tauri-native/issues/12), [#13](https://github.com/gronxb/tauri-native/issues/13), [#14](https://github.com/gronxb/tauri-native/issues/14), [#15](https://github.com/gronxb/tauri-native/issues/15), [#17](https://github.com/gronxb/tauri-native/issues/17), [#18](https://github.com/gronxb/tauri-native/issues/18) | Gate the proven end-to-end feature and packages. |
| [#20](https://github.com/gronxb/tauri-native/issues/20) | [#18](https://github.com/gronxb/tauri-native/issues/18), [#19](https://github.com/gronxb/tauri-native/issues/19) | Require technical and independent adoption evidence before stable release. |

M4 can proceed alongside later M2/M3 work when its individual prerequisites are ready. The added M6–M8 runtime-preservation work is required for the revised product contract.

## Release decision

A 1.0 candidate requires:

- [x] Positive M0 feasibility evidence and a published support/unsupported table.
- [x] Ordinary producer source remains unchanged by export.
- [x] Both hosts consume copied iOS/Android artifacts with no source/Rust dependency.
- [x] Nonblocking commands and teardown/cancellation are tested, with honest type/event limitations.
- [x] One useful document save/search feature works independently on desktop and mobile.
- [x] Native/compatibility/package/relocation checks pass for the candidate commit.
- [ ] At least two independent integrations complete the documented artifact-only workflow.
- [x] Migration instructions, limitations, candidate packages and release notes are reviewable.

The completed implementation gates are backed by the [compatibility contract](https://github.com/gronxb/tauri-native/blob/5320ec8e0b67bf061b79c89dfe408a0a90edcb3f/docs/compatibility.md), merged [RN/Expo](https://github.com/gronxb/tauri-native/pull/27), [Lynx](https://github.com/gronxb/tauri-native/pull/29), [async](https://github.com/gronxb/tauri-native/pull/30), [type](https://github.com/gronxb/tauri-native/pull/31) and [view](https://github.com/gronxb/tauri-native/pull/32) acceptance, and [Fieldnotes execution evidence](https://github.com/gronxb/tauri-native/blob/5320ec8e0b67bf061b79c89dfe408a0a90edcb3f/docs/evidence/fieldnotes-local-2026-09-07.json). Mobile evidence covers the documented simulator/emulator scope. [CI acceptance](https://github.com/gronxb/tauri-native/pull/36) and [complete RC validation at `eb1fab8`](https://github.com/gronxb/tauri-native/actions/runs/34111222423) passed. Physical-device RC execution and independent onboarding remain open in #20.

The release-preparation requirement was delivered in merged [PR #37](https://github.com/gronxb/tauri-native/pull/37): matching 1.0.0-rc.0 packages, migration/support guidance, changelogs and release notes. Its [successful candidate workflow](https://github.com/gronxb/tauri-native/actions/runs/34111222423) provides the exact validated tarballs; [candidate evidence](https://github.com/gronxb/tauri-native/blob/015191221e72fd62ecf04dca46e71ce35e5f5e25/docs/releases/1.0.0-rc.0.md) records their hashes. The [main release at `1fbb5a3`](https://github.com/gronxb/tauri-native/actions/runs/34133681385) also passed its own producer, iOS, Android and candidate gates: all 13 required native JUnit scenarios per platform passed without failures, errors or skips. It published all three `1.0.0-rc.0` packages to the experimental npm channel. Downloaded registry tarballs match the exact validated candidate, including SHA-1/SHA-512 integrity metadata. Physical-device checks and two independent onboarding records still gate stable readiness.

Independent evaluator contact and stable package publication follow the maintainer's normal authorization process when execution reaches those steps. This roadmap does not invent dates, testimonials, performance numbers or completed validation.

## Deliberately deferred

- Unrestricted desktop-only window APIs and arbitrary macro/serde inference; mobile runtime/plugin preservation is now required by M6–M8.
- New host frameworks, a hosted artifact registry, OTA delivery, remote production frontend loading, or a cloud sync service.
- A mandatory tauri-native producer SDK/template/core layout disguised as onboarding.
- Live native-code replacement and a new plugin ecosystem separate from Tauri; existing Tauri Mobile plugin/event compatibility belongs to M6–M8.

Each implementation issue includes concrete source evidence, scope, dependencies, verification commands, scenario tests, risks and acceptance criteria. Local mirrors are under `plans/`. The M6 baseline implementation is tracked in #41.
