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

M7 implementation is in progress: #42 has real desktop and all four RN/Lynx mobile native dispatch evidence with explicit caller grants and original Tauri capability checks. Package-owned C/JNI sessions preserve the original Tauri bootstrap. #43 has an ordinary official-plugin location-note fixture with completed desktop/iOS/Android execution: real Swift/Kotlin position callbacks, Tauri ACL, OS permission denial/grant, deep-link resume and process-relaunch persistence pass. Source-free native iOS/Android plugin callers and pending-callback retirement also pass; RN/Lynx package-level plugin acceptance remains open. No M7–M8 issue is closed from compilation or a partial native run.

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


#44 now exports format 2 / ABI 3 iOS and Android artifacts with the original Tauri bootstrap and official native plugins. Both arm64 Debug source-free gates pass after deleting the disposable producer and relocating to a path with spaces, including actual Swift/Kotlin permissions/callback retirement, deep-link remount and persistence. Android ELF/APK alignment also passes. Retained caching now records actual dependency/native configuration inputs; both platform cache hits and iOS native invalid-capability failure preservation pass. Arm64 Release native plugin runs and source-path remapping now also pass on both platforms, including Android R8 and actual invalid-capability failure preservation. Other architecture execution, authored native/compiler configuration and production RN/Expo/Lynx integration remain open. See [#44](https://github.com/gronxb/tauri-native/issues/44), [iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-ios-2026-09-09.json) and [Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-portable-android-2026-09-09.json).


#44's [complete native-slice gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-release-slices-2026-09-09.json) also passes: all seven Release libraries, source-free app links for three iOS targets, and a universal Android Release/R8 APK with all four ABIs and 16 KB alignment. This does not claim execution on every architecture or physical devices. The next source-fidelity gate covers authored native Xcode/Manifest/compiler settings before proceeding to package-owned M8 consumers.


Existing native-project settings now also survive source-free arm64 Release execution: [iOS configuration evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-native-config-ios-2026-09-09.json), [Android configuration evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-native-config-android-2026-09-09.json). The exporter preserves the existing Xcode/Gradle project, original compiler flags and supported wrapper chain; native input hashes, cache hits, failure preservation and full plugin/lifecycle runs pass. The next implementation work is package-owned RN/Expo and Lynx composition using these artifacts, including native events and renderer lifecycle acceptance. No unavailable device/adopter evidence is claimed.


Native event implementation now passes the real desktop 24-scenario gate and source-free Android Release/R8 session/plugin execution, including cancel/unlisten, scoped original Tauri events and exactly-once delivery after remount. A separate ten-start Android probe reproduced two early frontend IPC failures caused by Wry's page-start URL callback ordering. The event feature and startup reliability are tracked separately in #42–#44; M8 package integration and release/device/adopter gates remain open.

The matching [iOS Release native event gate](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-events-ios-2026-09-09.json) now also passes after producer deletion and relocation: actual Swift plugin callbacks, explicit subscription cancellation/unlisten, original save and background deep-link events, exactly one new event after remount, and one live native listener. Native client readiness, OS permission retirement, setup counts and persistence remain intact.

The generated Android capture now records the actual initial main-frame request URL after Tauri supplies its protocol response, before that response executes JavaScript. It retains volatile visibility, ordinary IPC, source URL selection and Tauri ACL; it does not assign a hardcoded local origin. [Recovery evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-android-origin-recovery-2026-09-09.json) passes ten fresh-data Release/R8 starts even with the later page-start URL write artificially delayed by two seconds. The production capture function was exercised against a reconstructed native scaffold from the source-free artifact; native library bytes stayed identical. This targeted regression is distinct from the full Rust export/plugin/event gates, and broader SDK/release acceptance remains open.

M8 #46 is IN PROGRESS with package-owned iOS/Android Lynx hosts, NativeModules and a shared retained session/event API. Actual npm tarballs pass source-free arm64 Release execution beside the unchanged Tauri frontend: shared state/setup, separate caller/Tauri/OS permissions, location save, background deep links, native listener cleanup at renderer replacement and fresh event delivery. Android uses non-debuggable Release/R8 with all eleven native libraries and APK 16 KB alignment passing. iOS preserves the original `AppDelegate` and also removes Lynx while the original frontend continues handling commands in the same process. Evidence: [Android](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-android-2026-09-09.json), [iOS](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-ios-2026-09-09.json). Automatic composition/autolinking, retained TauriView, RN/Expo parity, consistent session-open diagnostics, pending-OS-callback renderer retirement and the complete six-combination/device/adopter gates remain open. No issue or release is closed by these scoped package executions.

M8 #45 is now IN PROGRESS: the packed RN Android SDK executes a generated TurboModule, Fabric surface and package-owned ReactHost beside the original Tauri application. A relocated arm64 non-debuggable Release/R8 consumer passes native permissions/plugins, shared state/setup, BackHandler/Linking, background deep links, engine replacement and removal. Native listeners are zero before replacement and after removal; the original frontend continues in the same process. All eleven ELF libraries and APK 16 KB alignment pass. [RN Android evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-android-2026-09-09.json). RN iOS, Expo CNG, automatic composition/autolinking, retained TauriView, pending-OS-callback renderer retirement and complete parity/device/adopter acceptance remain open; no issue or release is closed by this Android-only result.

M8 #45 now also passes packed RN iOS Release execution with the same retained artifact contract. The generated TurboModule, Factory and Fabric surface preserve original Swift plugins, permissions, shared state/setup and background Tauri deep-link events. Native listeners retire before replacement and after removal; own-process inspection confirms the RN JS thread exits after removal, while the original Tauri frontend and AppDelegate continue in the same process. Scoped RN linkage preserves the original archive byte-for-byte. [RN iOS evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-2026-09-09.json). This completes the scoped iOS/Android SDK execution checkbox, with explicit consumer attachment. Expo, automatic composition/autolinking, retained TauriView, iOS RN Linking forwarding, session-open diagnostic parity, pending OS callback retirement and complete six-combination/device/adopter gates remain open.

M8 #45 now has package-owned Android automatic composition from copied artifacts. The revised packed Release gate passes ten UI flows, including the unmodified generated Activity/default layout, plus shared state/plugins/permissions, BackHandler/Linking, RN replacement and removal. Both non-debuggable APKs preserve the original Tauri Activity chain and all native library bytes. The default-layout status-bar failure was corrected with RN-container insets and retained separately from successful evidence. Both SDKs now ship a public format 2 reader. [Android composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-android-2026-09-09.json). Expo, iOS/Lynx automatic composition, retained TauriView, custom lifecycle owners and full parity/device/adopter acceptance remain open.

M8 #45 now has packed RN automatic composition on iOS as well as Android. The iOS gate installs pods, regenerates, installs again and passes nine Release UI flows without Rust. SDK launch observation preserves the original Tauri startup/delegate, plugins, state and WebView; renderer removal retires native listeners and the RN JS thread while the original frontend continues. A second clean-installed app runs unmodified generated startup/default layout with no acceptance hooks. Four macOS metadata/ownership scenarios pass; the shared composer refactor preserves all 98 Android generated files. [iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-compose-ios-2026-09-09.json). Expo, Lynx automatic composition, retained TauriView, custom lifecycle owners, iOS RN Linking, pending OS callback retirement and complete parity/device/adopter acceptance remain open. No issue or release is closed by this increment.

M8 #46 now has packed Lynx Android automatic composition from copied artifacts. Nine Release/R8 UI flows pass, including renderer removal with original frontend continuity and a second clean-installed APK using the unmodified generated Activity/default layout. Both APKs are non-debuggable, have identical eleven native libraries and pass 16 KB alignment. Shared composition ownership preserves identical RN outputs on both platforms. [Lynx Android composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-android-2026-09-09.json). A preceding original-baseline wait failed with an unconfirmed cause; the subsequent pass does not establish a fix. This scoped gate uses an older export, so latest-exporter startup validation remains required alongside Lynx iOS automatic composition, Expo, retained TauriView and full lifecycle/parity/device/adopter gates.

Fresh Android export validation now passes through the complete native gate and both packed automatic-composition SDK consumers: [fresh Android export and SDK evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-android-composition-2026-09-09.json). The original producer is unchanged and deleted, real invalid-capability failure preserves the previous artifact, and RN ten/Lynx nine UI flows share one immutable current-exporter artifact. Original plugins, permissions, events and renderer removal survive; both default generated SDK apps run non-debuggable Release/R8. Repeated startup reliability and the earlier unconfirmed Lynx baseline failure remain separate work, alongside pending-OS-callback renderer retirement and the remaining M8 parity/device/adopter gates.

Lynx automatic composition now also passes on iOS: [Lynx iOS composition evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-compose-ios-2026-09-10.json). The packed public composer preserves the original Tauri startup/delegate, archive and minimum OS while generating CocoaPods and safe-area attachment. Two pod installations with regeneration between them and nine source-free Release UI flows pass, including a second app with unmodified generated startup and no acceptance hooks. Shared Apple metadata/receipt helpers preserve existing RN iOS/Android and Lynx Android outputs. RN and Lynx now each have scoped automatic-composition evidence on both platforms; Expo, third-party autolinking, retained TauriView, pending OS callback retirement, complete parity and device/adopter acceptance remain open.

Pending OS permission renderer retirement and session-open error parity now pass
in all four packed RN/Lynx platform gates: [SDK permission-retirement evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-sdk-permission-retirement-2026-09-11.json). Forty-one Release UI flows
verify the old renderer cannot save after retirement, a new renderer can use
the real granted permission, original state/setup/plugins remain intact, and
unmodified generated startup works. A fresh unchanged-producer iOS export also
passes twelve standalone native flows: [fresh iOS export evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-tauri-fresh-ios-2026-09-10.json). The initial Lynx Android report
collection failure is retained separately from the successful full rerun.
Expo CNG, third-party autolinking, retained TauriView/navigation, RN iOS Linking, Activity recreation/RN-owned permissions, broader source forms/native channels, complete parity/CI/migration, physical devices and independent adopters remain open. No issue or release is closed and no package is published.

RN iOS URL delivery now passes eighteen packed Release UI flows: [RN iOS Linking evidence](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-react-ios-linking-2026-09-11.json).
The original Tauri AppDelegate object and return values are preserved, its
callbacks are restored after RN removal, and actual custom URLs reach the
current RN engine once per invocation. UIKit launch URLs remain initial URLs
across reload; a URL received during delayed renderer attachment stays an event.
Both acceptance and unmodified generated apps pass with the existing immutable
artifact. Native activity injection is distinct from pending OS Universal Link
association. Expo, third-party autolinking, retained TauriView, broader source
forms and lifecycle cases, complete parity/CI/migration and device/adopter gates
remain open. No issue or release is closed and no package is published.

## Retained Lynx view progress — 2026-09-11

The public retained Lynx `TauriView` reuses the original Tauri WebView on iOS and
Android. [34 Release UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-lynx-view-2026-09-11.json) pass in packed, source-free consumers,
including unmodified generated startup/default layouts. Embedded frontend and
native calls share actual plugin state and notes; competing mounts are rejected;
view/renderer replacement and close preserve the original document, delegate/client,
state and single setup. The original producer and runtime artifacts are unchanged.
See [#46](https://github.com/gronxb/tauri-native/issues/46) for the precise single-view
scope. RN TauriView, broader navigation/lifecycle and Expo/autolinking/parity/CI/
migration/device/adopter acceptance remain open. No release or roadmap gate is closed.

## Retained RN view progress — 2026-09-11

The retained RN `TauriView` reuses the original Tauri WebView on both platforms.
[43 source-free Release UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-rn-view-2026-09-11.json) pass from packed SDKs,
including unmodified generated startup/default layouts. Original frontend save/
event/ACL behavior shares real Tauri state with RN. Competing mounts are rejected;
view/engine remount and close preserve the document and native handlers and
restore the original parent. Existing RN iOS Linking, Android BackHandler and
pending-permission retirement gates still pass. All 14 authored producer files
and both runtime artifacts remain unchanged. See
[#45](https://github.com/gronxb/tauri-native/issues/45) for the single-view scope.
Expo/autolinking, broader navigation/lifecycle/source forms and complete parity/
CI/migration/device/adopter acceptance remain open. No release or roadmap gate
is closed by this increment.

## RN Android permission progress — 2026-09-11

The generated retained Activity now routes RN `PermissionsAndroid` requests
through a separate AndroidX result registration while preserving the original
Tauri plugin callbacks. [24 packed Release UI flows](https://github.com/gronxb/tauri-native/blob/main/docs/evidence/retained-rn-permissions-2026-09-11.json) pass, including
RN denial/grant, multiple and concurrent native permission results, replacement
while the OS dialog is open, and the unmodified generated Activity. The retired
RN listener receives no result; a new engine reusing RN request code zero receives
only its own result. Existing Tauri permissions, view/state/setup, BackHandler,
Linking and teardown scenarios still pass. All 14 authored producer files and
the original artifact inventory remain unchanged. Denial labels keep each
upstream API's semantics; the SDK does not rewrite Tauri's permission cache.
Expo native modules/CNG/autolinking, Activity recreation and broader lifecycle/
source forms, complete parity/CI/migration/device/adopter gates remain open.
No issue or release gate is closed.
