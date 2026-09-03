# tauri-native

> [!WARNING]
> This is a proof-of-concept (PoC) project currently under development.

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

## Why tauri-native?

`tauri-native` is for teams that have ordinary, independently runnable projects:

- a React Native or Lynx application that owns the mobile lifecycle and native navigation;
- a Tauri application that owns a web frontend and reusable Rust behavior.

Adding `tauri-native` packages the Tauri frontend and Rust core for the mobile host without merging scaffolds or starting a second Tauri application runtime.

The examples preserve that boundary on purpose: `examples/react-native`, `examples/lynx`, and `examples/tauri` remain ordinary scaffolded applications. The mobile screens show a native direct-call area and a visibly separate `TauriView` surface; the same Tauri project also runs as the desktop application. The React Native host uses Expo SDK 57 Continuous Native Generation, so its iOS project is regenerated from `app.json` and the `@tauri-native/react-native` config plugin instead of being maintained by hand.

On desktop, that Tauri frontend fills the native window. On iOS, the same packaged frontend appears only inside the labeled `TauriView` boundary, so ownership remains visible in the demo rather than being hidden by matching chrome.

## Packages

| Package | Responsibility |
| --- | --- |
| `@tauri-native/react-native` | Fabric `TauriView`, synchronous JSI `invoke`, and iOS native integration |
| `@tauri-native/lynx` | Lynx custom `TauriView`, typed native-module `invoke`, and iOS native integration |
| `@tauri-native/cli` | Exports the Rust core as an XCFramework and the Tauri frontend as an iOS resource bundle |

`@tauri-native/react-native` uses React Native Builder Bob to produce ESM and TypeScript declarations. `@tauri-native/lynx` follows Lynx Native Library autolinking and code generation. `@tauri-native/cli` uses Commander for its command interface and `@clack/core` for terminal output.

The `0.0.1` packages are configured to publish under the `experimental` npm dist-tag. Install the CLI in the Tauri project that owns the frontend and Rust code. Install only the matching bridge package in each native host.

```sh
# Run in the Tauri project
npm install --save-dev @tauri-native/cli@experimental

# Run in the React Native or Lynx host
npm install @tauri-native/react-native@experimental
# or: npm install @tauri-native/lynx@experimental
```

## Bring an existing Tauri project

Keep the Tauri application and the mobile host as independent projects. Install `@tauri-native/cli` in the **Tauri project**. The package exposes the `tauri-native` executable and exports native artifacts from that project to any host that needs them.

For example, given sibling projects:

```text
workspace/
├── mobile-app/
└── tauri-app/
    └── src-tauri/
```

install and run the CLI from the Tauri project:

```sh
cd workspace/tauri-app
npm install --save-dev @tauri-native/cli@experimental
npx tauri-native export ios
```

The default export stays co-located with its source at `src-tauri/gen/tauri-native/ios`. It contains the XCFramework, packaged frontend, and local podspec. A bare native host can reference that directory directly, or the CLI can export straight into a chosen host:

```sh
npx tauri-native export ios \
  --output-dir ../mobile-app/ios/tauri-native
```

The default convention expects the reusable Rust static library at `src-tauri/crates/app-core/Cargo.toml` and its C ABI header at `src-tauri/crates/app-core/include/tauri_native.h`. Existing projects with another layout can pass `--manifest` and `--header` explicitly. The original Tauri project remains runnable as a normal desktop application.

For Expo, configure `@tauri-native/react-native` with the relative `tauriDir`. During `expo prebuild`, the plugin copies the existing co-located export into the generated iOS project and registers its Pod; it does not build the Tauri project. For Lynx or bare React Native, reference or copy the exported directory before `pod install` and add `TauriNativeGenerated` to the application target.

## Architecture

The build/distribution phase is separate from runtime. The Tauri project owns
the frontend, Rust core, and co-located native export. A selected mobile host
only consumes that export; it does not build or start another Tauri runtime.

### Build and distribution

```mermaid
flowchart LR
  subgraph TAURI["Tauri project (artifact owner)"]
    FRONTEND["Tauri frontend / frontendDist"]
    CORE["shared Rust app-core"]
    CLI["@tauri-native/cli<br/>tauri-native export ios"]
    EXPORT["src-tauri/gen/tauri-native/ios<br/>co-located export"]
    XC["TauriNativeCore.xcframework"]
    ASSETS["TauriNativeAssets.bundle"]
    PODSPEC["TauriNativeGenerated.podspec"]

    FRONTEND -->|"beforeBuildCommand + copy frontendDist"| CLI
    CORE -->|"cargo build --release"| CLI
    CLI --> EXPORT
    EXPORT --> XC
    EXPORT --> ASSETS
    EXPORT --> PODSPEC
  end

  subgraph RN_DIST["React Native / Expo host"]
    RN_PLUGIN["@tauri-native/react-native<br/>Expo config plugin"]
    RN_POD["ios/tauri-native<br/>TauriNativeGenerated local Pod"]
    RN_PLUGIN -->|"copy export + register Pod"| RN_POD
  end

  subgraph LYNX_DIST["Lynx host"]
    LYNX_POD["TauriNativeGenerated local Pod"]
  end

  EXPORT -->|"expo prebuild reads tauriDir"| RN_PLUGIN
  EXPORT -->|"Podfile references export directly"| LYNX_POD
```

### Runtime boundaries

```mermaid
flowchart LR
  subgraph GENERATED["Generated iOS artifacts in the selected mobile host"]
    ASSETS["TauriNativeAssets.bundle<br/>packaged Tauri frontend"]
    XC["TauriNativeCore.xcframework<br/>C ABI + compiled app-core"]
  end

  subgraph RN["React Native host (owns UIApplication and lifecycle)"]
    RNJS["React Native JS"] -->|"generated TurboModule"| JSI["C++ JSI"]
    RNVIEW["Fabric TauriView"] --> RNWEBVIEW["Swift WKWebView<br/>script-message handler"]
    RNWEBVIEW --> RNOBJC["Objective-C++ C ABI bridge"]
  end

  subgraph LYNX["Lynx host (owns UIApplication and lifecycle)"]
    LYNXJS["Lynx JS"] -->|"typed Native Module"| LYNXBRIDGE["Objective-C / Objective-C++ bridge"]
    LYNXVIEW["tauri-view custom element"] --> LYNXWEBVIEW["Swift WKWebView<br/>script-message handler"]
    LYNXWEBVIEW --> LYNXBRIDGE
  end

  subgraph DESKTOP["Standard Tauri desktop host"]
    WEB["Tauri frontend"] -->|"invoke"| COMMAND["#[tauri::command] adapter"]
    COMMAND --> DESKTOP_CORE["shared Rust app-core"]
  end

  ASSETS -->|"loaded by WKURLSchemeHandler"| RNWEBVIEW
  ASSETS -->|"loaded by WKURLSchemeHandler"| LYNXWEBVIEW
  JSI -->|C ABI| XC
  LYNXBRIDGE -->|C ABI| XC
  RNOBJC -->|C ABI| XC
```

There are five invocation paths:

1. React Native JS → generated TurboModule → C++ JSI → the Rust C ABI in the XCFramework.
2. Packaged Tauri frontend in React Native → Swift `WKWebView` message handler → Objective-C++ bridge → the same C ABI.
3. Lynx JS → typed native module → Objective-C / Objective-C++ bridge → the Rust C ABI in the XCFramework.
4. Packaged Tauri frontend in Lynx → Swift `WKWebView` message handler → the same Objective-C++ bridge → the same C ABI.
5. Standard Tauri frontend → `#[tauri::command]` → the same Rust crate.

The React Native and Lynx branches are alternative hosts, not two runtimes in
one application. The selected host remains the sole owner of `UIApplication`,
rendering, and lifecycle. React Native's Fabric view and Lynx's custom element
each wrap a Swift-owned `WKWebView`; neither embeds or initializes a second
`tauri::App`.

## Run the example workspace

Install dependencies and generate the mobile iOS projects and artifacts:

```sh
nub install
nub --cwd examples/tauri run export:ios
nub --cwd examples/react-native run prebuild:clean:ios
nub --cwd examples/lynx run pods
```

The Tauri example owns the co-located export under `src-tauri/gen/tauri-native/ios`. Expo prebuild copies it into the generated application's `ios/tauri-native` local Pod, while the Lynx Podfile references the same export directly. Re-run `export:ios` after changing the embedded Tauri frontend or Rust core.

Run the React Native example:

```sh
# Terminal 1
nub --cwd examples/react-native run start

# Terminal 2
nub --cwd examples/react-native run ios
```

Build and open the Lynx iOS example:

```sh
nub --cwd examples/lynx run pods
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

The iOS views disable WebView pinch zoom, and the bundled demo locks viewport scaling so double-tap input focus cannot leave the embedded surface enlarged or horizontally clipped.

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
tauri-native export ios [options]

--tauri-dir <path>   Tauri Rust directory              default: src-tauri
--manifest <path>    Rust core Cargo.toml               default: <tauri-dir>/crates/app-core/Cargo.toml
--header <path>      C ABI header                       default: <manifest-dir>/include/tauri_native.h
--output-dir <path>  Generated iOS artifact directory   default: <tauri-dir>/gen/tauri-native/ios
```

Workspace example:

```sh
nub --cwd examples/tauri run export:ios
```

Equivalent direct invocation:

```sh
cd examples/tauri
npx tauri-native export ios
```

To place a copy directly in a manually managed native host instead, pass `--output-dir ../react-native/ios/tauri-native` or another destination relative to the Tauri project.

The command reads `build.beforeBuildCommand` and `build.frontendDist` from `tauri.conf.json`, builds the frontend, and produces:

| Artifact | Contents |
| --- | --- |
| `TauriNativeCore.xcframework` | arm64 iOS device plus arm64/x86_64 simulator static libraries and C header |
| `TauriNativeAssets.bundle` | The unchanged files from the configured Tauri `frontendDist` |
| `TauriNativeGenerated.podspec` | A local Pod that exposes those application-specific artifacts to either native host package |

The generated output belongs to the Tauri project and is intentionally excluded from the npm packages. It can be copied into a native host or referenced as a local Pod. The Expo config plugin copies the co-located export during prebuild; the Lynx example references it directly.

The Rust manifest must produce a `staticlib`. Its header must expose the current C ABI:

```c
char *tauri_native_invoke(const char *command, const char *payload_json);
void tauri_native_string_free(char *value);
```

The returned UTF-8 JSON allocation belongs to Rust and must be released exactly once with `tauri_native_string_free`.

## License

MIT. See [LICENSE](./LICENSE).
