# Real Tauri runtime verification

The ordinary producer lives in `../fixtures/runtime-tauri`. Standalone checks are documented there. Composition checks copy that producer, preserve its authored files and modify only generated platform integration. They execute real native renderers and Tauri/Wry. These are M6 feasibility gates, not the public exporter or portable host SDK. Run all runtime/composition gates one at a time, including across iOS and Android: Tauri CLI 2.11.4 shares mobile build connection options for this application identifier, so concurrent builds can overwrite a still-running build's options.

## Retained native dependency selection

From the repository root, with the mobile toolchain environment below and a
selected device, run these gates serially:

```sh
node --experimental-strip-types packages/cli/test/runtime/baseline.ts plugins --dependency-selection
node --experimental-strip-types packages/cli/test/runtime/portable.ts ios --release --dependency-selection
node --experimental-strip-types packages/cli/test/runtime/portable.ts android --release --dependency-selection
```

These use `mobile-plugin-tauri` and the public retained exporter. Before hashing,
the fixture variant makes geolocation optional, enables it in `build.features`,
and adds a renamed opener dependency restricted to non-mobile targets. Rust,
frontend and plugin registration code remain unchanged. All three runs compare
the same variant source hashes; both mobile gates delete the producer, relocate
the complete artifact and build without Rust on PATH. Each requires twelve real
native UI flows for permissions, callback retirement, events and persistence.
Android uses Release/R8 with test-only signing/debuggability for telemetry.
Reports live in `target/retained-dependency-selection-{desktop,ios,android}`.

The CLI's six `retained-dependencies.test.ts` scenarios exercise actual Cargo
resolution for aliases, target conditions, optional/default features, build/dev
dependencies and differing slices. They do not establish native compatibility;
the [native evidence](../../../../docs/evidence/retained-target-dependencies-2026-09-11.json)
records that separately. Unsupported active plugins still fail before export.

## Transferred renderer packages

The RN/Expo and Lynx `retained-ios.ts` / `retained-android.ts` gates, and the
composed Android recreation gate, accept these environment variables:

- `TAURI_NATIVE_SDK_TARBALL`: the matching SDK tarball received from the producer job.
- `TAURI_NATIVE_SDK_SHA256`: its expected SHA-256 from that job's receipt.
- `RETAINED_DEPENDENCIES`: a separate installed renderer dependency project.
- `RETAINED_TEST_OUTPUT`: the parent directory for this run's evidence.

A transferred SDK is hashed before extraction and checked for the requested
package name. The consumer does not run npm pack or the SDK's source build.
Missing or changed inputs fail; GitHub Actions cannot fall back to local
repacking. Local runs without a transfer continue to pack the current SDK and
use the example's dependencies. Android checks the actual emulator ABI against
the receipt, requires 16 KB pages and verifies the APK's packaged slices and
alignment. Linux selects its own NDK host tools. Adding these input paths does
not establish a completed CI run or x86_64 native execution.

## Android Activity recreation

With the Android environment below, run these from the repository root, serially:

```sh
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts standalone
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts react /path/to/retained-android
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts lynx /path/to/retained-android
# First request after recreation, OS denial, another recreation, then OS grant:
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts react /path/to/retained-android --fresh-permission
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts lynx /path/to/retained-android --fresh-permission
# Recreate while the actual OS permission dialog remains pending:
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts react /path/to/retained-android --pending-permission
node --experimental-strip-types packages/cli/test/runtime/recreation-android.ts lynx /path/to/retained-android --pending-permission
```

The standalone runner builds the ordinary fixture with the Tauri CLI. Its probe
inherits the generated MainActivity, including its original `onCreate`; only
the disposable generated class is opened for subclassing. The composed runners
receive or pack the SDK, build the existing renderer fixture and call its public
composer with a complete Release artifact matching the emulator. Their consumer builds omit
Rust from PATH and keep Release/R8 non-debuggable, with a debug test signing key.

Each runner obtains location permission through the OS UI, saves a note and
calls the real `Activity.recreate()` twice. Five native UI flows require three
distinct Activity/WebView objects, the same process and Wry window ID, State 45,
single setup/plugin initialization, preserved notes, a new location save and
deep-link delivery. Composed apps also require zero old native listeners and
one new listener, with exactly two new renderer events after the final recreation.
Native telemetry streams to a file before launch so logcat ring eviction cannot
remove the initial identity records. Results are written under
`target/retained-activity-recreation/{standalone,react,lynx}`.

`--fresh-permission` instead starts without a location grant or saved note.
After the first recreation it requests and denies permission through the OS UI.
The second recreation must retain `prompt-with-rationale`; a new request and
OS grant must then allow a location save and deep-link event. Its seven UI flows
and separate reports live under `target/retained-activity-recreation/fresh-permission`.
This requires a new export containing the ActivityResult registration correction.
The original Tauri 2.11.5 launcher fails after recreation; the same correction
is applied only to the exported dependency copy, preserving the producer.

`--pending-permission` starts each request with the renderer's `Request then save`
action and recreates through a test-only broadcast while the actual OS dialog
remains visible. It denies the first request and grants the second, after a
second recreation. Nine UI flows require completion of the original Tauri
callback on each replacement Activity, no sentinel note from the retired
renderer, and a later save/deep link from the new renderer. The disposable
consumer adds only logging after the unchanged original permission callback;
it does not substitute OS results or dispatch. Reports and callback logs are
under `target/retained-activity-recreation/pending-permission/{react,lynx}`.
The [pending-callback evidence](../../../../docs/evidence/retained-pending-recreation-2026-09-11.json)
also preserves the failure with an artifact predating the registration fix.

The ordinary fixture's ten startup scenarios run before recreation. Its
one-time initial-state assertion expects 40 in a fresh JS document; recreated
documents keep State 45. The gate records that fixture assertion failure and
checks preserved state and operational plugins directly through original IPC.
It does not claim that the initial self-test passed again. RN-owned permissions,
process death and Expo recreation need separate
gates. See the [scoped evidence](../../../../docs/evidence/retained-activity-recreation-2026-09-11.json),
including the separately retained unsuccessful attempts.

## Android Lynx

Install workspace dependencies first (`nub ci`). On macOS with an arm64 emulator booted:

```sh
export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export ANDROID_SERIAL=emulator-5554
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$HOME/.maestro/bin:$PATH"
nub --cwd packages/cli run test:runtime:compose:android
```

The test requires Node, npm, Cargo, the standard Tauri Android toolchain, `unzip` and Maestro. It uses installed `examples/lynx` JS dependencies and downloads the pinned Lynx Android libraries through Gradle. It recreates its ignored producer/renderer workspaces under `target/tauri-mobile-composition/lynx-android/`, installs `dev.taurinative.runtimeproof`, checks native UI and reports, and uninstalls that proof app afterward. Do not run another proof using that application ID on the same emulator concurrently.

The Activity retains Tauri's superclass and lifecycle. The Lynx surface mounts after the unchanged Tauri frontend completes its ten baseline assertions. Actual Lynx JS calls a test native module, which evaluates a probe through the retained Tauri WebView's IPC. Assertions require shared state 45, single setup/plugin initialization, allow/deny enforcement without denied side effects, the same process after background/resume, and a second native surface after destruction of the first. Maestro must find and tap the actual renderer controls. Reports alone cannot pass the gate.

The generated build adds 16 KB Rust linker alignment and inspects all native ELF load segments packaged in the APK. Tauri 2.11.5's build cache does not track a changed Android codegen output directory, so the test refreshes only the `tauri` crate's Android output before building its disposable platform project. Authored producer hashes are checked even when the test fails.

This probe uses the original WebView caller's permissions. Production direct native caller identity and dispatch belong to #42. Native Swift/Kotlin plugin integration, artifacts, Expo, Release and physical devices have separate M7–M8 acceptance.

## iOS Lynx

With workspace dependencies installed, boot an arm64 iOS simulator and run:

```sh
export PATH="$HOME/.cargo/bin:$HOME/.maestro/bin:$PATH"
export IOS_SIMULATOR_UDID=<booted-simulator-UDID>
nub --cwd packages/cli run test:runtime:compose:ios
```

Xcode, xcodegen, CocoaPods, the standard Tauri iOS tools and Maestro are required. The test creates a disposable standard Tauri project under `target/tauri-mobile-composition/lynx-ios/`, adds only generated native sources/resources/Pod dependencies and retains the sole `ffi::start_app()` bootstrap. It registers UIKit lifecycle observers before Tauri starts and attaches a real Lynx view to the original WKWebView's parent after the baseline completes. The original Tauri app delegate and WebView stay alive; no replacement UIApplication or RN/Lynx app delegate is introduced.

The same five native JS probes, real UI actions, remount and background/resume assertions apply. The harness installs and removes only `dev.taurinative.runtimeproof` on the selected simulator. Evidence is Debug Simulator execution; it does not establish Swift plugin/OS callback coverage or production direct native dispatch.

## React Native

With the same per-platform environment as above, run `test:runtime:compose:rn:ios` or `test:runtime:compose:rn:android` from the CLI package. These select React Native 0.86.3 instead of Lynx. They use installed `examples/react-native` JS dependencies to build an offline Metro bundle, but do not install Expo native modules. Results/logs live under `target/tauri-mobile-composition/react-native-{ios,android}/`.

Android retains `TauriActivity`, initializes RN's `ReactHost`, attaches real Fabric surfaces and awaits actual asynchronous surface stop before remount. Generated integration registers the real RN core Java TurboModule provider through the standard app library entry, uses the matching Hermes 250829098.0.17 and NDK/C++ runtime, and adds the RN-required Kotlin 2.1.20 compiler. CMake 3.22.1 is required. The APK remains Debug and debuggable; native debug symbols are stripped to keep emulator installation small. All packaged native ELF segments must still satisfy 16 KB alignment.

iOS retains `ffi::start_app()` and Tauri's UIApplication delegate, then uses `RCTReactNativeFactory` to create and stop Fabric root views. RN raises only the generated native target's deployment minimum to 16.4; the authored Tauri configuration stays unchanged. The same five actual renderer calls, UI interactions, lifecycle/remount, shared state, plugin allow/deny and source-integrity assertions apply to both platforms.

## Independent Tauri after integration removal

After the four composition gates pass, remove only their disposable generated native integrations from the repository root:

```sh
rm -rf target/tauri-mobile-composition/lynx-android/producer/src-tauri/gen \
  target/tauri-mobile-composition/lynx-ios/producer/src-tauri/gen \
  target/tauri-mobile-composition/react-native-android/producer/src-tauri/gen \
  target/tauri-mobile-composition/react-native-ios/producer/src-tauri/gen
nub --cwd packages/cli run test:runtime:baseline
nub --cwd packages/cli run test:runtime:ios
nub --cwd packages/cli run test:runtime:android
```

Run these commands serially with the same native toolchain environment. The ordinary fixture is the source for each standalone runner; it has no renderer imports or native composition dependencies. Each runner asserts all ten baseline scenarios and authored source integrity. Compare the twelve source hashes in the standalone reports with the four composition reports. The [2026-09-09 independence report](../../../../docs/evidence/tauri-composition-independence-2026-09-09.json) records this final check: all three platforms pass with state 45 and single application/plugin setup after all four integrations were deleted.
