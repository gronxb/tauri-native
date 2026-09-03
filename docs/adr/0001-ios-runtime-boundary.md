# ADR 0001: React Native owns the iOS runtime

- Status: accepted for the iOS proof of concept
- Date: 2026-09-03

## Context

The desired package API is `@tauri-native/react-native`, including `<TauriView />` and a direct React Native JS → C++ JSI → Rust call path. The repository must also contain independently runnable, conventionally scaffolded React Native and Tauri examples.

The product idea is microfrontend composition: the Tauri project owns a web frontend and reusable Rust behavior; the React Native project owns the mobile application. Adding `tauri-native` packages the former for the latter without merging their source trees or replacing either scaffold.

## Adversarial review

Three competing positions were considered before implementation.

### Embed a complete Tauri runtime

This has the most attractive compatibility story: existing commands, plugins, events, window management, and Tauri JavaScript APIs might continue unchanged.

It was rejected for this PoC because Tauri mobile and React Native both expect to bootstrap and own the application/runtime boundary. A view-level component cannot safely arbitrate two owners of `UIApplication`, delegate callbacks, URL handling, event-loop state, and teardown. Tauri handles and plugin machinery also depend on an initialized app/runtime; they are not a standalone command bus around an arbitrary `UIView`.

### Use WRY or a plain web view and invent a new JavaScript API

This avoids the double-runtime problem, but a new API such as `window.ReactNativeRust.invoke` makes the frontend host-specific. The same Vite source would need transport branches and would no longer demonstrate that a normal Tauri frontend was packaged unchanged.

### Share the application core and preserve a narrow Tauri API seam

This keeps one application owner while retaining source-level reuse. It does not offer full Tauri runtime compatibility, but it supports the specific integration required by the PoC without depending on Tauri's internal runtime objects.

## Decision

React Native is the sole iOS application and lifecycle owner.

- Business behavior lives in `examples/tauri/src-tauri/crates/app-core` with a JSON dispatcher and explicit command allowlist.
- A normal Tauri window reaches it through a thin `#[tauri::command]` adapter.
- React Native JavaScript reaches it synchronously through a generated TurboModule, C++ JSI, and the core's C ABI.
- `TauriView` is a Fabric component whose `WKWebView` and message handling are implemented in Swift.
- `tauri-native export ios` compiles the core into an XCFramework and copies the Tauri `frontendDist` into an asset bundle.
- The CLI places those application-specific outputs in a generated `TauriNativeGenerated` local Pod owned by the consuming app. Published host packages contain only reusable bridge source and depend on that Pod.
- The packaged frontend is served by a private `tauri-native://app` `WKURLSchemeHandler`. This gives its Vite ES modules and CSS one origin without rewriting the generated files.
- At document start, the view installs only the `window.__TAURI_INTERNALS__.invoke` function that `@tauri-apps/api/core.invoke` needs. It forwards allowlisted JSON commands to Rust and resolves the returned promise.

The Objective-C++ surface is intentionally small: one file satisfies the C++ Fabric component descriptor boundary and one exposes the Rust C ABI to Swift. WebView ownership, asset loading, navigation policy, and script-message handling remain Swift code.

## Security and compatibility boundary

The bridge is an invoke compatibility seam, not an embedded Tauri runtime.

- Only packaged local content is loaded; navigation outside the private asset scheme is rejected.
- Rust decides which commands exist. Arbitrary native symbol or plugin access is not exposed.
- React Native JS and WebView JS are separate runtimes and share no JavaScript state.
- Tauri plugins, capabilities, events, windows, and other internal APIs are unsupported.
- Reliance on the `__TAURI_INTERNALS__.invoke` shape is a version-sensitive risk. The package must test supported `@tauri-apps/api` versions and adapt the shim when that upstream contract changes.
- Synchronous direct JSI is acceptable for this CPU-small PoC only. An asynchronous API needs explicit concurrency, cancellation, and teardown semantics.

## Acceptance evidence

- The reusable Rust calculator parses decimals, whitespace, unary signs, parentheses, and the four arithmetic operators with normal precedence.
- Eight core tests cover precedence, unary/decimal input, division by zero, malformed expressions and payloads, empty input, unknown commands, and FFI allocation ownership.
- A Tauri adapter test calls the same core through `#[tauri::command]`.
- The CLI produces an XCFramework with device, arm64-simulator, and x86_64-simulator support plus the unchanged Vite distribution bundle.
- React Native Builder Bob produces ESM and TypeScript outputs for `@tauri-native/react-native`.
- Debug and Release iOS simulator builds succeed with the New Architecture enabled.
- The saved iOS integration flow changes both expressions, then verifies `7 * (8 - 2) = 42` through React Native JSI and `18 / (2 + 1) = 6` through the packaged Tauri microfrontend.
- The standard Tauri desktop example compiles and launches independently against the same frontend and core.

## Consequences and next gates

This structure proves shared application code and frontend portability, not complete runtime embedding. A production iteration should add only the next capabilities demanded by real commands:

1. Replace synchronous JSI with an asynchronous request protocol for blocking work.
2. Generate or share command schemas so Rust and TypeScript contracts cannot drift.
3. Define cancellation, concurrency, error, and thread-affinity behavior.
4. Test supported `@tauri-apps/api` versions as an explicit compatibility matrix.
5. Add signed physical-device CI and reproducible package publication.
6. Design Android AAR packaging after the iOS contract is stable.

Full Tauri plugin/runtime compatibility remains out of scope unless Tauri exposes an officially supported embedded-runtime contract.
