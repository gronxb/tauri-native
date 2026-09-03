# tauri-native

Embed a packaged Tauri microfrontend in a React Native or Lynx application and call the same Rust command implementation from each host.

```tsx
import { TauriView, invoke } from '@tauri-native/react-native';

const response = invoke<Calculation>('calculate', {
  expression: '7 * (8 - 2)',
});

export function Screen() {
  return <TauriView style={{ height: 330 }} />;
}
```

> **Project status:** experimental iOS proof of concept. The packages are not published yet. The repository demonstrates the intended package and CLI contracts using workspace dependencies.

## Why tauri-native?

`tauri-native` is for teams that have ordinary, independently runnable projects:

- a React Native or Lynx application that owns the mobile lifecycle and native navigation;
- a Tauri application that owns a web frontend and reusable Rust behavior.

Adding `tauri-native` packages the Tauri frontend and Rust core for the mobile host without merging scaffolds or starting a second Tauri application runtime.

The examples preserve that boundary on purpose: `examples/react-native`, `examples/lynx`, and `examples/tauri` remain ordinary scaffolded applications. The mobile screens show a native direct-call area and a visibly separate `TauriView` surface; the same Tauri project also runs as the desktop application.

On desktop, that Tauri frontend fills the native window. On iOS, the same packaged frontend appears only inside the labeled `TauriView` boundary, so ownership remains visible in the demo rather than being hidden by matching chrome.

## Packages

| Package | Responsibility |
| --- | --- |
| `@tauri-native/react-native` | Fabric `TauriView`, synchronous JSI `invoke`, and iOS native integration |
| `@tauri-native/lynx` | Lynx custom `TauriView`, typed native-module `invoke`, and iOS native integration |
| `@tauri-native/cli` | Builds the Rust core as an XCFramework and packages the Tauri frontend as an iOS resource bundle |

`@tauri-native/react-native` uses React Native Builder Bob to produce ESM and TypeScript declarations. `@tauri-native/lynx` follows Lynx Native Library autolinking and code generation. `@tauri-native/cli` uses Commander for its command interface and `@clack/core` for terminal output.

## Architecture

```mermaid
flowchart LR
  subgraph RN[React Native host]
    RNJS[React Native JS] -->|TurboModule| JSI[C++ JSI]
    RNVIEW[TauriView] --> RNWEBVIEW[Swift WKWebView bridge]
  end

  subgraph LYNX[Lynx host]
    LYNXJS[Lynx JS] -->|typed Native Module| LYNXBRIDGE[Objective-C++ bridge]
    LYNXVIEW[tauri-view] --> LYNXWEBVIEW[Swift WKWebView bridge]
  end

  subgraph OUTPUT[tauri-native build ios]
    ASSETS[TauriNativeAssets.bundle]
    XC[TauriNativeCore.xcframework]
  end

  subgraph DESKTOP[Standard Tauri host]
    WEB[Tauri frontend] -->|invoke| COMMAND[tauri command adapter]
  end

  ASSETS --> RNVIEW
  ASSETS --> LYNXVIEW
  JSI -->|C ABI| XC
  RNWEBVIEW -->|C ABI| XC
  LYNXBRIDGE -->|C ABI| XC
  LYNXWEBVIEW -->|C ABI| XC
  COMMAND --> CORE[shared Rust app-core]
  XC -. contains compiled .-> CORE
```

There are five invocation paths:

1. React Native JS → generated TurboModule → C++ JSI → Rust C ABI.
2. Packaged Tauri frontend in React Native → Swift `WKWebView` bridge → Rust C ABI.
3. Lynx JS → generated native module → Objective-C++ bridge → Rust C ABI.
4. Packaged Tauri frontend in Lynx → Swift `WKWebView` bridge → Rust C ABI.
5. Standard Tauri frontend → `#[tauri::command]` → the same Rust crate.

The selected mobile host remains the sole owner of `UIApplication`, rendering, and lifecycle. `TauriView` is a Swift-owned `WKWebView`; it does not embed or initialize a second `tauri::App`.

## Requirements

- Node.js 22.11 or newer
- React Native New Architecture
- Lynx 4 and XElement for the Lynx example
- Rust and `rustup`
- Xcode and CocoaPods
- Nub 0.8.3 for this repository's scripts
- Maestro CLI only for the optional iOS end-to-end test

The current implementation supports iOS. Android and AAR output are not implemented.

## Run the example workspace

Install dependencies and generate the iOS artifacts:

```sh
nub install
nub run pods:ios
nub run pods:lynx:ios
```

Run the React Native example:

```sh
# Terminal 1
nub --cwd examples/react-native run start

# Terminal 2
nub --cwd examples/react-native run ios
```

Build and open the Lynx iOS example:

```sh
nub run pods:lynx:ios
open examples/lynx/ios/Hello-Lynx.xcworkspace
```

Run the same Tauri project as a normal desktop application:

```sh
nub --cwd examples/tauri run tauri dev
```

The example is a calculator rather than a hard-coded native response. JavaScript sends an editable expression to Rust. Rust parses decimals, unary signs, parentheses, and `+`, `-`, `*`, `/` with normal operator precedence.

The React Native screen exercises both mobile transports:

- `Run expression` calls Rust directly from React Native JavaScript through C++ JSI.
- The embedded `TauriView` runs the packaged Tauri frontend, whose existing `@tauri-apps/api/core.invoke('calculate', ...)` call reaches the same Rust implementation.

The Lynx example presents the same two operations using its generated `TauriNative` native module and registered `tauri-view` custom element.

The Lynx frontend follows the create-rspeedy scaffold. Its Swift host follows Lynx's [existing-app iOS integration flow](https://lynxjs.org/guide/start/integrate-with-existing-apps?platform=ios): initialize `LynxEnv`, provide the packaged bundle through `LynxTemplateProvider`, construct `LynxView`, and load `main.lynx`. [Native Library autolinking](https://lynxjs.org/guide/autolink) registers the tauri-native module and element. `XElement` is included because the calculator uses Lynx's native [`<input>`](https://lynxjs.org/next/api/elements/built-in/input.html).

## React Native API

### `TauriView`

```tsx
import { TauriView } from '@tauri-native/react-native';

<TauriView style={{ flex: 1 }} />;
```

`TauriView` accepts standard React Native `ViewProps`. In this PoC it loads the single `TauriNativeAssets.bundle` packaged by the CLI. Selecting bundles or remote URLs is intentionally unsupported.

### `invoke<T>(command, payload)`

```ts
import {
  invoke,
  type InvokeResponse,
} from '@tauri-native/react-native';

interface Calculation {
  result: number;
  source: string;
}

const response: InvokeResponse<Calculation> = invoke('calculate', {
  expression: '(9 + 5) * 3',
});

if (response.ok) {
  console.log(response.value.result); // 42
} else {
  console.error(response.error.code, response.error.message);
}
```

The direct JSI API is synchronous. Keep commands short and CPU-bounded. File, network, database, or otherwise blocking commands require a future asynchronous API.

## Lynx API

```tsx
import { TauriView, invoke } from '@tauri-native/lynx';

const response = invoke<Calculation>('calculate', {
  expression: '(9 + 5) * 3',
});

export function Screen() {
  return <TauriView className="tauriView" />;
}
```

`invoke` uses the autolink-generated `TauriNative` native module. Native module callbacks must run in Lynx background scripting (`'background only'`). `TauriView` creates the registered native `tauri-view` element and loads the same packaged assets as the React Native component.

## CLI

```text
tauri-native build ios [options]

--tauri-dir <path>   Tauri Rust directory              default: src-tauri
--manifest <path>    Rust core Cargo.toml               default: <tauri-dir>/crates/app-core/Cargo.toml
--header <path>      C ABI header                       default: <manifest-dir>/include/tauri_native.h
--output-dir <path>  Generated iOS artifact directory   default: <tauri-dir>/gen/tauri-native/ios
```

Workspace example:

```sh
nub run build:native:ios
nub run build:native:lynx:ios
```

Equivalent direct invocation:

```sh
node packages/cli/bin/tauri-native.mjs build ios \
  --tauri-dir examples/tauri/src-tauri \
  --output-dir packages/react-native/ios/Generated
```

The command reads `build.beforeBuildCommand` and `build.frontendDist` from `tauri.conf.json`, builds the frontend, and produces:

| Artifact | Contents |
| --- | --- |
| `TauriNativeCore.xcframework` | arm64 iOS device plus arm64/x86_64 simulator static libraries and C header |
| `TauriNativeAssets.bundle` | The unchanged files from the configured Tauri `frontendDist` |

The Rust manifest must produce a `staticlib`. Its header must expose the current C ABI:

```c
char *tauri_native_invoke(const char *command, const char *payload_json);
void tauri_native_string_free(char *value);
```

The returned UTF-8 JSON allocation belongs to Rust and must be released exactly once with `tauri_native_string_free`.

## Integrating another workspace

The current PoC has no `init` command. Use the example wiring as the reference integration:

1. Put host-independent commands in a Rust crate built as both `rlib` and `staticlib`.
2. Keep thin Tauri `#[tauri::command]` functions that delegate to that crate.
3. Export the C ABI shown above from the same crate.
4. Run `tauri-native build ios` before CocoaPods resolves the selected host package.
5. Write the generated artifacts to the selected package's `ios/Generated` directory, which its podspec consumes.
6. Render `<TauriView />` or call `invoke(...)` from the React Native or Lynx application.

See the concrete files:

- [`examples/react-native/ios/Podfile`](examples/react-native/ios/Podfile)
- [`examples/lynx/ios/Podfile`](examples/lynx/ios/Podfile)
- [`examples/tauri/src-tauri/src/lib.rs`](examples/tauri/src-tauri/src/lib.rs)
- [`examples/tauri/src-tauri/crates/app-core`](examples/tauri/src-tauri/crates/app-core)
- [`packages/react-native/TauriNativeReactNative.podspec`](packages/react-native/TauriNativeReactNative.podspec)
- [`packages/lynx/ios/TauriNativeLynx.podspec`](packages/lynx/ios/TauriNativeLynx.podspec)

Writing generated output into an installed package directory is a PoC constraint. A distribution-ready release needs an `init`/configuration flow and an application-owned artifact directory.

## Compatibility boundary

| Capability | Status |
| --- | --- |
| iOS device XCFramework | Supported by the CLI |
| arm64/x86_64 iOS Simulator | Supported by the CLI |
| React Native New Architecture | Required |
| React Native Old Architecture | Unsupported |
| Lynx 4 Native Library autolinking | Supported by the iOS PoC |
| Direct Lynx native-module invocation | Supported synchronously in background scripting |
| Tauri core `invoke` used by the packaged frontend | Supported for the fixed command dispatcher |
| Direct React Native JSI invocation | Supported synchronously |
| Tauri plugins, events, windows, menus, and capabilities | Unsupported in `TauriView` |
| Remote web content | Rejected |
| Android/AAR | Planned |

The injected `window.__TAURI_INTERNALS__.invoke` seam is deliberately narrow and version-sensitive. It makes the example's ordinary `@tauri-apps/api/core.invoke` call portable; it is not a promise that the rest of the Tauri JavaScript API works inside React Native.

## Security model

- `TauriView` serves packaged files through the private `tauri-native://app` scheme.
- Navigation outside that scheme is rejected.
- The WebView exposes only the invoke message transport.
- Rust owns the command allowlist and returns structured JSON success or error values.
- React Native JavaScript and WebView JavaScript remain isolated runtimes.

Do not use the current bridge to load untrusted or remote HTML.

## Development and verification

```sh
nub run test
cargo clippy --workspace --all-targets -- -D warnings
```

After installing the Release example on a booted simulator:

```sh
nub --cwd examples/react-native run test:e2e:ios
nub --cwd examples/lynx run test:e2e:ios
```

Each saved Maestro flow changes both input fields and verifies two independent calculations:

- Native direct bridge: `9 * (6 - 2) = 36`
- Packaged Tauri frontend: `18 / (2 + 1) = 6`

## Repository layout

```text
packages/cli/                              @tauri-native/cli
packages/react-native/                     @tauri-native/react-native
packages/lynx/                             @tauri-native/lynx
examples/react-native/                     React Native host scaffold
examples/lynx/                             Lynx + Rspeedy host scaffold
examples/tauri/                            Tauri 2 + Vite scaffold
examples/tauri/src-tauri/crates/app-core/  shared calculator and C ABI
docs/adr/0001-ios-runtime-boundary.md       architecture decision record
docs/adr/0002-lynx-host-boundary.md          Lynx host decision record
```

## Roadmap

- Asynchronous JSI commands with cancellation and teardown semantics
- Generated/shared command schemas
- Application-owned artifact configuration and `init` workflow
- Supported `@tauri-apps/api` compatibility matrix
- Signed physical-device CI
- Android AAR packaging

The architectural tradeoffs and rejected full-runtime embedding approach are documented in [`docs/adr/0001-ios-runtime-boundary.md`](docs/adr/0001-ios-runtime-boundary.md). The Lynx host boundary is recorded in [`docs/adr/0002-lynx-host-boundary.md`](docs/adr/0002-lynx-host-boundary.md).

## License

MIT OR Apache-2.0
