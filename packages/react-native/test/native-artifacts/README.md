# Copied-artifact RN gate

This host-owned screen checks eight ordinary commands through the installed TurboModule. The unmodified `standard-tauri` frontend checks the same eight cases through the packaged WebView. `contract.yaml` requires success, structured errors, unknown-command rejection, nulls and tagged-enum output from both transports. Unit fixtures with placeholder binary bytes cannot satisfy this gate.

First run the CLI's `test:export:ios` and `test:export:android` gates. They install the packed CLI, export the ordinary fixture, copy the complete results into paths with spaces, and **delete their producer and CLI installation**. Their reports and retained copied directories are prerequisites.

From the repository root, create a fresh bare RN host outside the workspace:

```sh
mkdir -p target/react-native-artifacts
npm pack ./packages/react-native --pack-destination ./target/react-native-artifacts
npm exec --yes --package @react-native-community/cli -- rnc-cli init TauriArtifactHost \
  --version 0.86.3 --directory /tmp/tauri-native-rn-artifact-host \
  --package-name dev.taurinative.rnartifacttest --skip-install --install-pods false --skip-git-init
npm install --prefix /tmp/tauri-native-rn-artifact-host "$PWD/target/react-native-artifacts/tauri-native-react-native-1.0.0-rc.0.tgz"
node packages/react-native/test/native-artifacts/prepare.ts \
  /tmp/tauri-native-rn-artifact-host \
  'target/export-ios/Independent Host/Native Artifacts' \
  'target/export-android/Independent Host/Native Artifacts'
```

`prepare.ts` validates through the **installed host package**, adds the documented local Pod/Gradle source sets and copies the QA screen. It does not import the CLI or producer. The fresh host has no Expo dependency. Use another fresh directory for a new run; the helper rejects an already integrated template.

Build from the fresh host with a PATH containing Node, Ruby/CocoaPods and native build tools, but no `cargo`/`rustc`. Configure `JAVA_HOME` and `ANDROID_HOME` normally. Check `command -v cargo` and `command -v rustc` produce no path. Run `pod install` with **the host's ios directory as the working directory**, so React Native's autolinker discovers that host.

```sh
# Working directory: the host's ios/
pod install
xcodebuild -workspace TauriArtifactHost.xcworkspace -scheme TauriArtifactHost \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ../build-ios CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES -jobs 4

# Working directory: the host's android/
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=4 --no-daemon
```

Release builds package the React Native JavaScript; Metro is not needed during execution. Install the built `.app` using `xcrun simctl install <simulator-id> <app-path>` and the APK using `adb -s <emulator-id> install -r <apk-path>`. Run the same flow once per platform:

```sh
maestro --udid <simulator-id> test packages/react-native/test/native-artifacts/contract.yaml
maestro --udid <emulator-id> test packages/react-native/test/native-artifacts/contract.yaml
```

For the Expo variant, create a separate SDK 57 / RN 0.86.3 host outside the workspace, install the same package tarball, copy the same full platform directories into `tauri-native/`, use `{ "artifactsDir": "./tauri-native" }` in the plugin and the same screen/bundle identifier. Run `expo prebuild --no-install --no-clean` twice and compare the Podfile and copied artifacts. Add unrelated native files before the second run and check they survive; transfer a second complete export and prebuild again to check replacement. SDK 57 defaults to recreating native folders without `--no-clean`. Then install Pods, build both Release targets and execute `contract.yaml` again. This verifies real CNG in addition to the package tests for preservation, upgrade and invalid-input behavior.

Run `pod install` after replacing iOS artifacts, even when Expo skips it because npm dependencies are unchanged. A changed archive name otherwise leaves stale CocoaPods link flags. Run Maestro flows serially: its local driver sessions can interfere when multiple processes run together.

Record host/framework versions, input manifests, build results, Maestro results and the emulator's `getconf PAGE_SIZE`. Validate the Android APK with `zipalign -c -P 16 -v 4`. Only arm64 simulator/emulator execution is claimed by these commands; the CLI gates separately compile and inspect all exported slices/ABIs. Remove only the uniquely identified QA app afterward. Do not count either test-owned host as an independent external adopter.
