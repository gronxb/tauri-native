# Independent document consumers

`test:external-consumer` runs the ordinary Fieldnotes producer on desktop, exports through an installed CLI tarball, deletes the producer copy, then builds and runs six installed-package consumers: bare React Native, Expo CNG and Lynx on iOS and Android. There are no workspace package aliases or producer imports in the hosts.

Use disposable integration scaffolds outside the checkout. Create the bare `TauriArtifactHost`, Expo `TauriArtifactExpo` and Lynx `Hello-Lynx` hosts using the [RN/Expo setup](../../../react-native/test/native-artifacts/README.md) and [Lynx setup](../../../lynx/test/native-artifacts/README.md). These recipes use the dedicated test app identifiers expected by this gate. Keep each scaffold's normal native toolchain and integration configuration. Existing test scaffolds and build caches can be reused; measurements do not claim cold dependency installation or clean native compilation.

The gate replaces these test hosts' SDK installation, received artifacts and example screen. Maestro clears their application data. Select dedicated devices; it never chooses an arbitrary running simulator or emulator. Expo and bare RN deliberately use the same test app identifier and run serially.

Android test applications also enable `WebView.setWebContentsDebuggingEnabled(true)` for Maestro's `androidWebViewHierarchy: devtools` mode. In repeated navigation tests, OS accessibility snapshots sometimes omitted the entire WebView subtree despite visible content. The [documented CDP mode](https://docs.maestro.dev/extra-materials/troubleshooting/known-issues) inspects the actual DOM. This instrumentation belongs only to disposable test applications; the SDKs and producer do not enable debugging. These flows verify runtime behavior, not screen-reader accessibility.

```sh
export RN_HOST=/tmp/tauri-native-rn-artifact-host
export LYNX_HOST=/tmp/tauri-native-lynx-artifact-host
export EXPO_HOST=/tmp/tauri-native-expo-artifact-host
export IOS_SIMULATOR_UDID=<dedicated-simulator-uuid>
export ANDROID_SERIAL=<dedicated-emulator-serial>
export ANDROID_HOME=<android-sdk>
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/<installed-ndk>"
export JAVA_HOME=<jdk-home>
export ZIPALIGN="$ANDROID_HOME/build-tools/<version>/zipalign"
# Node, Ruby/CocoaPods, Maestro, adb and Xcode tools; no cargo/rustc or Rust shims:
export NATIVE_HOST_PATH=<explicit-native-only-PATH>
nub --cwd packages/cli run test:external-consumer
```

The caller's normal PATH still needs Node, npm, nub, Cargo, Rust mobile targets and cargo-ndk for producer exports and package builds. Native host commands receive only `NATIVE_HOST_PATH`; the runner first verifies that both `cargo` and `rustc` are unavailable there. The host SDK is installed from a tarball copied into that host's `vendor-packages/` directory, then checked to resolve inside the host itself.

For producer-only iteration, run `nub --cwd packages/cli run test:external-consumer:export`. That creates `target/document-feature/export-report.json`, all seven native slices/ABIs and retained portable artifacts, but does not certify native host execution. `scripts/prepare-feature-hosts.ts` can receive those artifacts in the three disposable hosts for individual build/debug iterations.

The shared `scripts/feature-contract.yaml` saves through the native module, finds that document in the unchanged Tauri frontend, saves through the frontend, terminates/relaunches the host, and searches the frontend-created document through the native module and a newly mounted view. Domain tests also cover concurrent saves, replacement and corrupt-file preservation. Test-only desktop automation is injected into a separate copy and never exported.

After common setup succeeds, the runner attempts every host/platform even if one fails, writes `native-report.json` with the aggregate `passed` result, and exits nonzero if any consumer failed. It retains per-host JUnit/debug results, input package/manifest hashes, logs and measured build/bundle/install durations under `target/document-feature/`. Its relaunch measure is the sum of Maestro's launch command and first library assertion, including automation and settling overhead; it is not an OS first-frame benchmark. `distributionDiskBytes` comes from `du -sk` for the built app or APK and includes the entire host, not an incremental SDK size estimate. Export sizes cover the complete platform directories. Simulator/emulator evidence does not certify physical devices or independent external adoption.

For the controlled Rust-change and pending-search gate, first complete the normal run, then run:

```sh
FIELDNOTES_CHANGED_RUST=1 nub --cwd packages/cli run test:external-consumer
```

This edits only a disposable producer copy: the title-validation message changes from “Use” to “Enter”, and the reserved test query `__pending__` delays its Rust search by 20 seconds. The canonical example has no artificial delay. The desktop probe and all six mobile flows require the changed validation message; frontend artifact hashes must match the baseline. Additional native flows require navigation back to the idle library in under 18 seconds from submitting the delayed search, through both native invocation and an embedded view, followed by a successful new search/view. Results are retained separately under `target/document-feature-changed/`. A Rust request that already started can still finish; these checks exercise cancellation of delivery and view teardown, not preemptive interruption of Rust code.
