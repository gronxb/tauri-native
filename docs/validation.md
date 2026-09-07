# Candidate validation

The `Validate` workflow runs on pull requests and manual dispatch. The main-branch release workflow calls the same workflow and requires its candidate job to succeed before Changesets can publish. A missing, cancelled or failed native job prevents creation of a release candidate. There is no skip-to-success path for unavailable runners or devices.

**Implementation status:** the workflow is under acceptance in #19. The table below defines its required matrix; it is not evidence that a hosted run has already passed. The first [hosted producer job](https://github.com/gronxb/tauri-native/actions/runs/34065191262/job/101572600905) passed; native jobs and a complete run for the final rebased commit remain required before closing the issue.

## Bounded matrix

| Producer or consumer | Pinned baseline | Required execution |
| --- | --- | --- |
| Ordinary Tauri | Tauri 2.11.5, API 2.11.1, CLI 2.11.4; Rust 1.97.1; Node 24.15.0 | Real macOS Tauri frontend/IPC and source-preserving mobile exports |
| Bare React Native | RN 0.86.3, React 19.2.3; community CLI 20.1.0 | Release iOS and Android direct/embedded document, async and view flows |
| Expo CNG | Expo 57.0.20, RN 0.86.3, React 19.2.3 | Fresh generated native projects; Release iOS and Android document/pending flows |
| Lynx | Native 4.0.1, PrimJS 4.0.0, ReactLynx 0.125.0, Lynx UI 3.137.0 | Release iOS and minified Android document, async and view flows |
| iOS | Xcode 26.4.1; iOS Simulator 26.4.1 arm64 | Three installed host packages plus standalone Swift/WKWebView relocation |
| Android | NDK 27.1.12297006; API 37 x86_64 emulator with 16 KB pages | Three installed host packages plus transferred standalone JNI/WebView APK |

All three iOS slices and four Android ABIs are built and inspected. CI executes only the named simulator/emulator architectures. It does not establish a version cross-product, physical-device compatibility, signed distribution or accessibility conformance. Expo does not claim the separate runtime-replacement QA controls used in the bare RN/Lynx lifecycle flows. Broader support and physical RC checks require their own recorded evidence.

The Lynx example enables full Release R8 and declares the input behavior and Gson dependencies it uses. It does not pull in the aggregate XElement registry's unrelated media, SVG or Markdown behavior implementations. The Android gate retains a hash of the generated R8 mapping and exercises the minified application.

## Data flow

1. `producer` runs Rust/package/type/source-contract, Tauri protocol, type-parity and watch checks on macOS. It packs the CLI and SDKs, then installs that exact CLI tarball for standalone, async, event, ordinary document and changed-Rust exports. Each disposable producer is deleted before consumption. Export hashes and desktop results remain in the report.
2. The job archives portable exports and a standalone Android APK, alongside the three npm tarballs and their hashes. A receipt binds these files to the checkout commit. The Android APK is built on macOS because the current CLI's atomic publication uses the supported macOS implementation; the Linux job only consumes it.
3. `native-ios` and `native-android` verify the transferred receipt and archive hashes. Each creates fresh RN, Expo and Lynx scaffolds outside the checkout, installs the received SDK tarballs with npm and builds with `cargo` and `rustc` absent from PATH. Both jobs run Fieldnotes with its original Rust commands and with the disposable Rust-only edit. Bare RN/Lynx then run the async and scoped-view flows.
4. `candidate` requires all three jobs to succeed. It also checks that receipts include every required host/flow, reference the same inputs and contain successful pending-navigation evidence. It copies the already-tested tarballs into `release-candidate`.
5. `scripts/release.mjs` checks the candidate commit, all required results, tarball hashes, embedded package names/versions and publish settings before checking npm. It publishes the received tarballs without rebuilding them, passing the validated registry, channel and access settings explicitly to npm. A tarball's embedded `publishConfig` alone does not select its experimental channel. The release regression test exercises real npm through a mandatory dry-run wrapper and verifies the selected channel. Package versions already on npm remain unchanged.

Native automation uses Maestro 2.4.0. Disposable Android applications enable WebView debugging so Maestro can inspect recreated WebViews through CDP. The SDK packages and producer artifacts do not enable debugging. Timing reports include automation overhead and warm build caches; they are not first-frame or incremental SDK size benchmarks.

## Running the gates

The main entry points are:

```sh
# Supported macOS producer environment, with Xcode/Rust mobile targets/NDK:
nub ci
node scripts/ci/producer.mjs

# On another prepared native machine at the same commit, after downloading
# producer-input into target/ci/input:
node scripts/ci/prepare-hosts.mjs
# Set IOS_SIMULATOR_UDID or ANDROID_SERIAL to a dedicated device.
node --experimental-strip-types scripts/ci/native.mjs ios
node --experimental-strip-types scripts/ci/native.mjs android
```

The setup writes `target/ci/hosts.json`, and the native runner reads it directly. On Actions it also exposes the host paths to later steps through `GITHUB_ENV`. The setup uses existing native tools locally; `.github/actions/native-tools` is intended for disposable hosted runners. Never select a device belonging to another task.

For the standalone Android gate alone, `ANDROID_CONSUMER_BUILD_ONLY=1 nub --cwd packages/cli run test:export:android` creates `target/export-android/consumer-prepared.json` and `Independent Host/ArtifactHost.apk`. Copy both with that directory layout and run:

```sh
ANDROID_SERIAL=<dedicated-16kb-emulator> node packages/cli/test/native-export/android-device.mjs /copied/export-android/consumer-prepared.json
```

The preparation step reports that device execution is still required. Only the receiving-device step can produce the final native report.

## Evidence and failure handling

Each job streams command output while retaining its log file, and uploads available JSON, JUnit and Maestro evidence even on failure. Command logging preserves nonzero exit codes and literal arguments. This exposes the nested Fieldnotes build/flow progress while the receiving job is still running. The producer input and final release candidate are retained for 14 days. Record a permanent run URL and candidate commit in release notes; expired downloadable logs do not extend a support claim. A failed platform is not certified by another platform's passing result.

Android preflight also records guest memory. If APK installation fails, the receiving host records runner memory and attempts to retain guest memory and the latest 2,000 system log lines before continuing other consumers. A failed Android job also collects system logs before the emulator shuts down, covering later failures such as Maestro driver startup. Diagnostic failure preserves the original error. These logs support investigation; collecting them does not retry or certify a failed installation or flow.

The producer caches Cargo dependencies with the pinned Rust/Xcode/NDK inputs; every validation command still runs for the candidate. Android compilation uses the installed API 35/36 platforms. The emulator separately selects the repository's `android-37.0` 16 KB system image; `android-37` is not a published SDK package name. Its data disk is set to 6 GB. The native job records page size and free data space before building, requiring at least 1 GiB free for app installation. With the image's default data disk, all three Release apps failed installation because internal storage was exhausted.

The workflow supports the existing experimental package channel. It does not promote packages to stable or substitute for #20's independent evaluator and physical-device RC acceptance. No paid runners, signing credentials or additional secrets are required by this configuration.
