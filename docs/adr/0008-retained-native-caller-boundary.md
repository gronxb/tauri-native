# ADR 0008: Native callers of the retained Tauri application

- Status: implementation in progress; desktop and Android Lynx native execution passed, remaining mobile and portable artifact acceptance pending
- Date: 2026-09-09
- Depends on: [ADR 0007](0007-tauri-mobile-composition.md)
- Tracking: [#42](https://github.com/gronxb/tauri-native/issues/42), [#44](https://github.com/gronxb/tauri-native/issues/44)

## Initialization and dispatch

The generated copy preserves Tauri, tauri-build, the original Builder chain, command macros, managed state, plugin setup, capabilities and frontend. Only the entry-point run expression and setup error observation are wrapped. The wrapper performs Tauri's own `Builder::build` followed by `App::run`, publishing readiness after the original setup succeeds. A setup/build failure never reports ready. There is one platform bootstrap and no extracted-command dispatcher or separate application state registry.

Native requests call Tauri 2.11.5's `WebviewWindow::on_message` with its actual app invoke key and an owned response callback. The key stays inside Rust. Tauri performs command lookup, argument injection, capability/scope checks, plugin dispatch and result/error serialization. The embedded frontend retains the original Tauri IPC. `InvokeRequest` is an upstream custom-invoke API without a stable-version promise, so this integration is pinned to the verified Tauri version.

## Explicit permission context

The composition layer supplies a policy when preparing the generated runtime. It does not edit the producer's permission files:

```json
{
  "version": 1,
  "callers": {
    "native": {
      "webview": "main",
      "commands": ["snapshot", "increment", "plugin:runtime-probe|read"]
    }
  }
}
```

A native session names a caller declared by that artifact. Its effective permission is the intersection of the explicit native command list and the real Tauri permissions of the named WebView window. The WebView label is an explicit delegated permission context: Tauri's ACL engine still identifies that window/WebView, not an invented native ACL principal. Native callers cannot supply a different label, URL, invoke key or authorization headers in requests. Remote documents are rejected, and wildcard grants are not accepted by the native policy. No generated capability broadens the producer's grants. The installed native host is trusted application code; the C ABI is not a boundary for executing arbitrary untrusted native libraries.

## Request lifetime

ABI 3 provides `status`, `open`, `submit`, `poll`, `cancel` and `close` through an owned UTF-8 JSON C interface. This is distinct from the currently shipped limited-adapter ABI 2. Existing adapter export remains unchanged and cannot serialize a retained runtime as its old artifact format.

Each session and request has a monotonically increasing ID. Tauri work executes off the native UI caller thread. A cancelled queued request is skipped when dequeued; a command already entering/executing Tauri may finish its original side effects, but its cancelled or retired result cannot reach a replacement session. Closing a session retires its pending results. The bridge bounds sessions, pending requests, outstanding Tauri work and request/response sizes; cancelling running work does not free its execution capacity early.

The first implementation handles JSON invocation and bounded raw responses. Native event/channel delivery, platform callback integration, package-owned renderer sessions and portable artifact packaging have their own remaining M7–M8 gates. The existing WebView's ordinary event/channel path is preserved.

## Mobile session clients

The CLI package owns `RuntimeSession.java` and `TNRuntimeSession.h/.mm`. Android forwards through JNI to the same Rust JSON C interface; iOS calls that interface directly. Both clients are main-thread-owned, poll pending results without blocking the UI, and retire callbacks on cancellation or close. A renderer must close its session when it is destroyed and open a new one on remount. Closing the renderer session does not stop the original Tauri application or discard its state.

These clients do not load a second application runtime. Android's original TauriActivity loads the producer library, and iOS retains its original `ffi::start_app()` and Tauri application delegate. Package-owned RN/Expo/Lynx surface composition and portable artifact consumption still require their respective M7–M8 acceptance gates.

## Evidence

`nub --cwd packages/cli run test:runtime:retained` executes real macOS Tauri/Wry with the generated runtime and its C ABI. It verifies early-call rejection, explicit caller denial, real plugin ACL denial before side effects, original domain errors, registered-command restrictions, async state mutation, a subsequent real embedded snapshot, cancellation and renderer-session replacement while Rust work is held behind explicit barriers. The original setup failure is also executed and must terminate without advertising readiness. Producer hashes are checked across successful preparation/execution and failed startup. Full reports/logs are in ignored `target/retained-runtime/`.

The scenario producer adds ordinary Tauri commands for observation and deterministic barriers before export begins; it contains no tauri-native dependency or host bridge. The checked-in M6 fixture remains unchanged. Mobile native execution and production artifact/package support are not inferred from this desktop gate.
