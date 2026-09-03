# ADR 0002: Lynx is an additional host, not a second Tauri runtime

- Status: accepted for the iOS proof of concept
- Date: 2026-09-03

## Context

The same microfrontend model should work when a conventionally scaffolded Lynx application replaces React Native as the mobile host. The Tauri project and Rust application core must remain unchanged and independently runnable.

## Decision

- `@tauri-native/lynx` follows Lynx's Native Library and autolink layout.
- Lynx owns the iOS application and `LynxView` lifecycle.
- Direct Lynx JavaScript calls use the generated `TauriNative` native module, an Objective-C++ C-ABI adapter, and the same Rust static library.
- `<TauriView />` renders a registered `tauri-view` custom native element backed by the same Swift `WKWebView` boundary used by the React Native package.
- `@tauri-native/cli build ios` produces a separate application-consumed XCFramework and asset bundle for the Lynx Pod.

This deliberately does not initialize Tauri's application runtime inside Lynx. The embedded frontend receives only the narrow `invoke` compatibility seam.

## Consequences

- The standard Lynx, React Native, and Tauri scaffolds remain separate applications.
- The calculator command and packaged Tauri frontend are shared without host-specific branches in the Tauri source.
- Lynx native module calls currently follow Lynx's background-scripting requirement and remain synchronous in this PoC.
- Full Tauri plugins, events, capabilities, windows, and menus remain unsupported in the embedded view.
