# Fieldnotes: one document feature, independent hosts

`examples/ordinary-tauri-feature` is the canonical example. It is an ordinary Tauri application: two registered Rust commands, a small web frontend, the standard Tauri `invoke` and `appDataDir` APIs, and `core:default` permissions. It has no tauri-native dependencies, bridge code or host-specific frontend branches. The earlier `examples/tauri` calculator remains a legacy ABI regression fixture.

The native examples offer quick capture and search in React Native/Expo or Lynx. The RN/Expo screen also installs `react-native-safe-area-context@5.7.0` for safe navigation around system bars; this is a host UI dependency. “Open notebook” navigates to the exported Tauri frontend; “Back to library” destroys that view. Both screens use the same local documents. The desktop application uses its own application data directory and runs independently.

## Run the producer

From `examples/ordinary-tauri-feature`:

```sh
npm ci
npm test
npm run tauri dev
# Build the ordinary desktop executable:
npm run build:desktop
```

Create documents by title, search a phrase from the title or body, open a result to edit it, and save again. A repeated title replaces that document; titles are case-sensitive while search uses Unicode lowercase substring matching. Titles are trimmed and limited to 120 characters; each body is limited to 64 KiB of UTF-8. Errors appear beside the editor.

The store is a small JSON file, `fieldnotes/documents.json`, below the application's data directory. A process-local Rust mutex protects read/modify/write transactions, and saving writes a sibling temporary file before renaming it over the store. The example is for one application process and a modest notebook. It does not provide cross-process locking, database indexing, cloud synchronization, backups or a power-loss durability guarantee. It never replaces corrupt JSON with an empty store.

## Export and receive artifacts

Use a candidate CLI built from the same source revision as the host packages until a new package version is published. Packing installs the candidate in an unrelated project without workspace package aliases:

```sh
# Repository root; install build dependencies and pack matching candidates.
nub ci
mkdir -p /tmp/tauri-native-candidate
npm pack ./packages/cli --pack-destination /tmp/tauri-native-candidate
npm pack ./packages/react-native --pack-destination /tmp/tauri-native-candidate
npm pack ./packages/lynx --pack-destination /tmp/tauri-native-candidate
# Ordinary producer directory:
npm install --save-dev /tmp/tauri-native-candidate/tauri-native-cli-0.1.0.tgz
npx tauri-native export ios
npx tauri-native export android
```

In the independent React Native/Expo host, install `/tmp/tauri-native-candidate/tauri-native-react-native-0.1.0.tgz`; in Lynx, install `/tmp/tauri-native-candidate/tauri-native-lynx-0.1.0.tgz`. Use `npm install <tarball>` from that host. These candidate tarballs replace the published-package install commands in the host guides below. The host receives only its matching SDK package.

Copy the complete `src-tauri/gen/tauri-native/ios` and `android` directories to the host's `tauri-native/` directory. Copy either export's `commands.ts` to `tauri-native/commands.ts`; when receiving both, verify those files are identical. The example host imports this generated contract and connects `createCommands(invoke)` to its installed SDK. The host owns these copies and does not need the producer checkout, CLI or Rust compiler when building.

For the workspace examples, receive artifacts in `examples/react-native/tauri-native/` and `examples/lynx/tauri-native/`. Follow the [Expo/bare React Native integration](../../packages/react-native/README.md) or [Lynx integration](../../packages/lynx/README.md) to install the local Pod and Android source sets. Rebuild and reinstall the host after replacing native binaries; refresh Pods after replacing iOS exports.

## Application data directory contract

The embedded frontend's standard `@tauri-apps/api/path.appDataDir()` and the host SDK's asynchronous `appDataDir()` resolve the same persistent, host-private directory:

| Environment | Directory |
| --- | --- |
| Ordinary desktop Tauri | Tauri's application data directory for the producer identifier |
| iOS host | `Library/Application Support/tauri-native/` in the host sandbox |
| Android host | `Context.getFilesDir()/tauri-native/` in the host sandbox |

The host adaptation returns an absolute path with a trailing slash; the application creates its own subdirectory when saving. Host updates and WebView recreation keep this directory. Uninstalling or clearing the host removes its application data. The producer's desktop bundle identifier does not select another mobile storage namespace. All views and direct invocations in one host share the host directory.

Only `plugin:path|resolve_directory` with `{ directory: 14 }`, the verified Tauri 2.11.1 API request for `appDataDir`, is supported. Other base directories, path joining/resolution operations and extra request fields reject with `unsupported_path_operation`. This does not add Tauri filesystem plugins, ACL enforcement, `AppHandle` or managed `State`. The document commands use ordinary Rust filesystem APIs and receive the path as an explicit argument; they are application code, not a filesystem permission boundary.

Both synchronous and async Rust command bodies run through the existing nonblocking host `invoke` protocol. Leaving the native search screen cancels delivery; unmounting a Tauri view closes its document session. Work already executing in Rust can finish, including a save already started. See [async invocation](../adr/0005-async-request-sessions.md) for the cancellation contract.

## Verification

The Rust tests cover content search after launching a new process, replacement by title, concurrent saves, validation and preservation of corrupt storage. The desktop probe drives the actual editor and results in a temporary Tauri copy, then terminates and relaunches that application. The test-only probe command is never included in exported artifacts. The ordinary `npm run build:desktop` command also passed on macOS with a shared Cargo target directory, producing a Release executable; `cargo test --workspace --locked` passed for the retained workspace fixtures.

The export gate installs a packed CLI, checks all iOS slices and Android ABIs, compares source and frontend hashes, copies the complete outputs, and removes its producer before host compilation. Mobile execution and build measurements are separate required evidence; a successful export alone does not certify them. Test-owned hosts are not independent external adopters.

Run `nub --cwd packages/cli run test:external-consumer` with the disposable hosts and native-only PATH described in the [gate instructions](../../packages/cli/test/feature/README.md). It records all six Release builds and save/search/relaunch flows, including package hashes, artifact inventories and timing/size measurement boundaries. For producer-only iteration, use `test:external-consumer:export`. The gate instructions also cover a controlled Rust edit and delayed-search cancellation run; its injected delay exists only in a disposable test copy.

## Recorded local results (2026-09-07)

Both the original producer and the controlled Rust-only variant passed the six installed RN/Expo/Lynx Release consumers on arm64 iOS Simulator 26.4.1 and arm64 Android API 37 with 16 KB pages. The desktop frontend passed save/search and process relaunch for both variants, and all three iOS slices and four Android ABIs were built and inspected. The final original-code run completed without manual intervention.

The changed-Rust run also passed all twelve pending-navigation cases. Each returned to the idle library in under 18 seconds while a 20-second Rust search was running. Its Expo Android feature flow required manually stopping the previous, background Lynx test application after Maestro CDP discovery timed out on that application's socket. The runner now stops the other gate-owned Android application before each consumer; the final original-code matrix verified that cleanup. This intervention is retained in the evidence and is not represented as an unattended changed-Rust run.

The original-code measurements below were recorded on an Apple M4 Mac with 24 GiB RAM. Build caches were warm and other verification work shared the machine. Native build time covers the xcodebuild/Gradle command, excluding npm installation, CocoaPods and separately invoked bundle tasks. Size is `du -sk` for the whole simulator app or universal APK; it is neither incremental SDK overhead nor installed-device size. Relaunch time adds Maestro's launch and first library-assertion durations, including automation/settling overhead. These are reproducible observations, not first-frame benchmarks or isolated performance comparisons.

| Host | Platform | Native Release build (s) | App/APK disk size (MiB) | Observed relaunch to library (s) |
| --- | --- | ---: | ---: | ---: |
| React Native | ios | 66.07 | 20.26 | 4.68 |
| React Native | android | 71.75 | 53.96 | 8.56 |
| Lynx | ios | 66.82 | 19.61 | 4.87 |
| Lynx | android | 26.24 | 45.22 | 9.66 |
| Expo CNG | ios | 76.52 | 27.07 | 2.60 |
| Expo CNG | android | 69.69 | 69.35 | 6.02 |

The original producer's iOS and Android exports took 42.43 and 66.97 seconds in that run. Complete exported inventories were 51.75 MiB for all iOS slices and 2.87 MiB for all Android ABIs/assets. Refreshing packaged artifacts still requires replacing the received directory and rebuilding/reinstalling the host. Storage is local to each host sandbox; the example does not implement cross-app synchronization.

The [compact evidence record](../evidence/fieldnotes-local-2026-09-07.json) retains package/manifest hashes, both native result sets and measurement boundaries. Full local reports and JUnit/Maestro logs are under `target/document-feature/` and `target/document-feature-changed/`. Automated CI, full minified host acceptance, physical devices and independent adopters are separate M5 gates.
