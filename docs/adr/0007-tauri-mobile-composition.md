# ADR 0007: Preserve Tauri Mobile when composing native renderers

- Status: accepted product requirement; implementation feasibility in progress
- Date: 2026-09-09
- Supersedes: the long-term runtime exclusion in ADRs 0001–0004. Their existing export behavior and evidence remain valid for the current limited adapter.
- Tracker: [PRD and roadmap #21](https://github.com/gronxb/tauri-native/issues/21)

## Requirement

An application remains an ordinary, independently runnable Tauri application on desktop, iOS and Android. React Native and Lynx are optional composition layers. Adding either must preserve supported Tauri Mobile behavior, including Builder setup, managed state, AppHandle, commands, events, native plugins and capabilities. Removing the composition layer must leave the original Tauri application runnable.

The producer does not add RN/Lynx imports, host detection, a second command registry or maintained bridge code. Tool-owned generated copies may add integration. Authored Rust, frontend, Cargo/configuration, capabilities and plugin sources remain unchanged. The host still receives portable artifacts rather than the producer checkout or a Rust build requirement.

## Architecture to prove

Keep a single platform application bootstrap and a real initialized Tauri application. The first candidate preserves the standard Tauri Mobile startup and attaches RN/Lynx surfaces through generated native integration. Native renderer initialization, navigation and teardown must cooperate with that bootstrap. This replaces the assumption that preserving native-host ownership requires removing Tauri itself.

The proof must resolve iOS UIApplication/delegate ownership and Android Activity/Application ownership before changing the public exporter. A host-driven alternative is acceptable only with equivalent real Tauri initialization and lifecycle delivery demonstrated on both platforms. No second UIApplication, competing Activity base classes, parallel mobile event loop, production MockRuntime or fake State/AppHandle implementation is an acceptable substitute.

Direct RN/Lynx calls must enter the retained Tauri command/permission machinery with an explicit caller identity. They must not use an unrestricted generated Rust dispatcher that bypasses plugin authorization. Embedded frontend calls retain ordinary Tauri IPC, events and error behavior. Both paths share one application state; removing a renderer must not reinitialize application state or plugins.

## Evidence behind the investigation

- Tauri 2.11.5 `mobile_entry_point` generates iOS `start_app` and Android bindings before invoking the application's entry point: [macro source](https://docs.rs/tauri-macros/2.6.3/src/tauri_macros/mobile.rs.html).
- Tauri's Android Activity forwards creation, Intent, configuration and destruction callbacks into PluginManager. Native plugin libraries also require generated platform integration: [mobile plugin contract](https://v2.tauri.app/develop/plugins/develop-mobile/).
- `App::run_iteration` is desktop-only, so pumping it from an RN/Lynx mobile event loop is not an available public integration technique: [App source](https://docs.rs/tauri/2.11.5/src/tauri/app.rs.html).
- `Webview::with_webview` exposes native view access, but by itself does not prove renderer composition or lifecycle compatibility: [API](https://docs.rs/tauri/2.11.5/tauri/webview/struct.Webview.html#method.with_webview).
- The current adapter deliberately removes `tauri`/`tauri-build` and rejects setup/state/plugin use (`packages/cli/native/src/manifest.rs`, `main.rs`). Lifting those diagnostics without replacing execution would silently lose behavior.

## Acceptance and sequencing

1. Establish a real Tauri baseline using setup, shared State, AppHandle, async commands, a Rust plugin, allow/deny permissions and Rust-to-web events. Run its unchanged frontend on standalone desktop and mobile, then prove native renderer coexistence.
2. Preserve the Builder and actual Tauri dispatch, initialization failures and teardown semantics in generated integration.
3. Carry Swift/Kotlin plugins, OS declarations, native dependencies, capabilities and callback routing across the boundary.
4. Version portable runtime artifacts and reject incompatible hosts before loading. Include all transitive native resources without embedding producer checkout paths.
5. Integrate RN/Expo and Lynx through package-owned native composition, then verify the same feature in standalone Tauri iOS/Android and both composed renderers on both platforms.

See the M6–M8 implementation plans in [the roadmap](../../plans/README.md). Initial baseline execution is not a completed mobile composition proof. Record simulator/emulator and physical-device evidence separately. Mobile-supported APIs are the target; desktop-only APIs retain upstream platform restrictions. Arbitrary third-party plugins or source forms require explicit evidence.

## Current support and release policy

The published limited adapter remains usable within its existing compatibility contract. Runtime preservation is planned work, not an additional compatibility claim for that artifact format. Keep rejecting unsupported runtime-dependent exports until the retained-runtime implementation and native acceptance pass. M5 candidate evidence remains historical evidence for that subset; the revised product contract adds M6–M8 gates before declaring full Tauri Mobile composition ready.

Development on this work is authorized directly on `main` with incremental commits, without pull requests. Publishing packages is a separate action.

## Initial runtime evidence — 2026-09-09

The [ordinary runtime fixture](../../packages/cli/test/fixtures/runtime-tauri) now passes ten real Tauri scenarios on standalone macOS, iOS Simulator and Android emulator, including state preservation across WebView reload and denial before plugin side effects. [Recorded evidence](../evidence/tauri-runtime-baseline-2026-09-09.json) identifies source hashes and exact scope. This establishes the behavioral baseline only. RN/Lynx attachment, renderer lifecycle and native Swift/Kotlin plugin composition remain unproven; the M6 architecture gate is still open.

## Android Lynx feasibility evidence — 2026-09-09

A [real Android composition gate](../../packages/cli/test/runtime/README.md) now passes using Tauri-driven startup. The generated `MainActivity` extends the original `TauriActivity`; `onWebViewCreate` attaches a `LynxView` alongside the retained WebView. Tauri's Activity and plugin lifecycle superclass calls remain intact. Removing and destroying the Lynx surface, recreating it and backgrounding/resuming the same Activity preserves state and single initialization. [Native/UI evidence](../evidence/tauri-composition-lynx-android-2026-09-09.json) records five actual JS-to-native probes, source hashes and verified 16 KB ELF alignment.

The probe proxies through the original Tauri WebView IPC using its existing caller identity and permissions. This is test-only feasibility wiring; #42 must define and enforce the production native caller boundary. It does not justify exposing unrestricted dispatch or lifting current exporter diagnostics. RN composition still needs native proof before the cross-platform architecture is accepted.

## iOS Lynx feasibility evidence — 2026-09-09

The [iOS native/UI gate](../evidence/tauri-composition-lynx-ios-2026-09-09.json) passes with the standard Tauri `ffi::start_app()` bootstrap and its existing UIApplication delegate. Generated native code observes UIKit launch/active/background notifications and attaches a Lynx view to the original WKWebView's parent. It does not replace that WebView or its delegate. Background/resume and removing/destroying/recreating the Lynx view preserve one Tauri process, state and plugin setup; source hashes and all original frontend assertions match.

This supports the Tauri-driven composition candidate for Lynx on both platforms. It remains a version-pinned prototype: production view attachment/caller dispatch and Swift/Kotlin plugin lifecycle are separate work, and RN native evidence is still required for M6 acceptance.
