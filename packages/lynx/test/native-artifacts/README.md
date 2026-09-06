# Copied-artifact Lynx gate

The host-owned QA screen checks eight ordinary commands through the public Lynx native module on the background scripting thread. The unchanged `standard-tauri` frontend checks the same cases through `TauriView`. The Maestro flow also unmounts/remounts the view and relaunches the host. Placeholder binaries used in package tests cannot satisfy this gate.

First run the CLI's `test:export:ios` and `test:export:android` gates. They retain complete copied artifacts and delete the producer and packed CLI installation. Use the **same retained directories** as the [RN/Expo gate](../../../react-native/test/native-artifacts/README.md); do not re-export a Lynx variant.

Create a fresh host outside the workspace from the committed example, then install the packed host package with npm:

```sh
mkdir -p target/lynx-artifacts
npm pack ./packages/lynx --pack-destination ./target/lynx-artifacts
mkdir /tmp/tauri-native-lynx-artifact-host
git archive HEAD examples/lynx | tar -x -C /tmp/tauri-native-lynx-artifact-host --strip-components=2
npm install --prefix /tmp/tauri-native-lynx-artifact-host "$PWD/target/lynx-artifacts/tauri-native-lynx-0.1.0.tgz"
node packages/lynx/test/native-artifacts/prepare.mjs \
  /tmp/tauri-native-lynx-artifact-host \
  'target/export-ios/Independent Host/Native Artifacts' \
  'target/export-android/Independent Host/Native Artifacts'
```

`prepare.mjs` validates through the installed host package, copies the full exports and QA screen, and assigns the unique test identifier `dev.taurinative.lynxartifacttest`. It enables debug signing only in this disposable Android host so its Release APK can be installed. The host has no CLI, RN package, producer checkout or workspace symlinks. Use a new directory for another run.

Build with Node, Ruby/CocoaPods and native tools on PATH, but no `cargo` or `rustc`; confirm both `command -v` checks return no path. Set `JAVA_HOME` and `ANDROID_HOME` for the Android SDK.

```sh
# Working directory: the fresh host
npm run build:ios

# Working directory: its ios/
BUNDLE_PATH=vendor/bundle bundle install
BUNDLE_PATH=vendor/bundle bundle exec pod install
xcodebuild -workspace Hello-Lynx.xcworkspace -scheme Hello-Lynx \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ../build-ios CODE_SIGNING_ALLOWED=NO ARCHS=arm64 ONLY_ACTIVE_ARCH=YES -jobs 3

# Working directory: its android/
./gradlew assembleRelease --max-workers=3 --no-daemon
```

Install `build-ios/Build/Products/Release-iphonesimulator/Hello-Lynx.app` and `android/app/build/outputs/apk/release/app-release.apk` on the selected simulator/emulator. Then run the same flow serially on each platform:

```sh
maestro --udid <ios-simulator-id> test packages/lynx/test/native-artifacts/contract.yaml
maestro --udid <android-emulator-id> test packages/lynx/test/native-artifacts/contract.yaml
```

For the existing calculator regression, replace both received platform directories with complete legacy calculator exports and restore the calculator host screen and stylesheet from [commit 5763426](https://github.com/gronxb/tauri-native/tree/5763426bf83502adeb1e7cf81392259ea8471151/examples/lynx/src). The current example is Fieldnotes and uses a different command contract. Rebuild the bundle, run `pod install` again to refresh changed archive names, and rebuild/install both Release hosts. Copy the `.maestro/*-integration.yaml` files from that same commit to a temporary flow with its `appId` changed to the unique QA identifier, then run it on the matching platform. Do not change the producer frontend or command implementation.

Record package/framework versions, artifact manifest hashes, native build results, the four Maestro results and Android `getconf PAGE_SIZE`. Run `zipalign -c -P 16 -v 4` on each APK. These checks cover arm64 simulator/emulator execution; other compiled slices and physical devices need separate evidence. Remove only the uniquely identified QA app afterward. A test-owned host does not count as an external adopter.
