# ADR 0002: Lynx is an additional host, not a second Tauri runtime

- Status: accepted for the iOS and Android proof of concept
- Date: 2026-09-03
- Updated: 2026-09-04

## Context

The same microfrontend model should work when a conventionally scaffolded Lynx application replaces React Native as the mobile host. The Tauri project and Rust application core must remain unchanged and independently runnable on both iOS and Android.

## Decision

- `@tauri-native/lynx` follows Lynx's Native Library and autolink layout.
- Lynx owns the iOS or Android application and `LynxView` lifecycle.
- Direct Lynx JavaScript calls use the autolink-generated `TauriNative` native module. In Lynx 4.0.1, `NativeModules` is a JSI `HostObject` and each module method is a JSI host function, so this supported Native Module API is already the JSI boundary on both platforms.
- On iOS, Lynx's JSI dispatch reaches the Objective-C++ `TauriNative` module, the C-ABI adapter, and the same Rust static library.
- On Android, Lynx's JSI dispatch reaches the Java `TauriNative` module, the package JNI adapter, and the same Rust shared library.
- A second package-owned JSI binding is not installed. It would duplicate Lynx's module lookup, argument conversion, runtime ownership, and teardown instead of using the framework-supported lifecycle.
- `<TauriView />` renders a registered `tauri-view` custom native element backed by the same `WKWebView` or Android `WebView` boundary used by the React Native package.
- `tauri-native export ios` produces a separate application-consumed XCFramework and asset bundle for the Lynx Pod.
- `tauri-native export android` produces normalized Rust shared libraries and packaged frontend assets consumed from the Lynx application source set.
- Generated application artifacts remain outside the published Lynx package: the iOS output lives in the consuming application's `TauriNativeGenerated` local Pod, while Android consumes the exported `jniLibs` and asset directories.

This deliberately does not initialize Tauri's application runtime inside Lynx. The embedded frontend receives only the narrow `invoke` compatibility seam.

## Consequences

- The standard Lynx, React Native, and Tauri scaffolds remain separate applications.
- The calculator command and packaged Tauri frontend are shared without host-specific branches in the Tauri source.
- Lynx native module calls use Lynx's JSI-backed `NativeModules` path, follow its background-scripting requirement, and remain synchronous in this PoC.
- JSI is the Lynx JavaScript-to-Native-Module boundary; platform conversion and the Objective-C++ or JNI adapter still remain between that boundary and Rust.
- The package depends on Lynx's public Native Module contract, not its private JSI classes. The ADR records the Lynx 4.0.1 implementation used by the PoC without making those internals part of the package API.
- Full Tauri plugins, events, capabilities, windows, and menus remain unsupported in the embedded view.

## Acceptance evidence

- The Lynx 4.0.1 source identifies its native-module manager as a JSI binding, installs `NativeModules` as a JSI `HostObject`, and creates module methods with JSI host functions.
- Lynx package code generation, type checking, and package verification pass without generated-file drift.
- The Lynx example builds a four-ABI Android debug APK and an arm64 iOS Simulator application with the generated Rust artifacts and autolinked `TauriNative` module.
