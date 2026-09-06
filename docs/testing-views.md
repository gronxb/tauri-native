# View lifecycle and standard-event acceptance

`nub --cwd packages/cli run test:events` loads the pinned actual Tauri event/core
JavaScript modules against all four injected shims. It checks scoped delivery,
JSON payloads, once/unlisten, explicit unsupported outcomes, capacity cleanup,
ready notifications and retired-document isolation. It is a protocol gate,
not a native UI simulation.

On the documented macOS/Xcode/Rust/Android NDK toolchain, run:

```sh
nub --cwd packages/cli run test:events:export
```

This launches a real ordinary desktop Tauri application. Its unchanged
frontend exercises standard scoped events, then the installed packed CLI
exports every mobile slice. The gate checks authored-source and frontend
hashes, copies complete exports and deletes the producer. Evidence is retained
in ignored `target/view-events/{desktop.json,export-report.json,artifacts/}`.
No desktop MockRuntime or frontend host detection is used by this gate.

Prepare the independent native hosts from the [RN](../packages/react-native/test/native-artifacts/README.md)
and [Lynx](../packages/lynx/test/native-artifacts/README.md) artifact procedures.
Install freshly packed host SDKs, then switch the disposable QA screens:

```sh
node scripts/prepare-view-hosts.mjs \
  /tmp/tauri-native-rn-artifact-host /tmp/tauri-native-lynx-artifact-host
```

Rebuild the Lynx bundle, run Pods and build both Release hosts for iOS and
Android using a PATH without `cargo` or `rustc`. Install each host, then run the
same flow serially for each host/platform:

```sh
maestro --udid DEVICE_ID test -e APP_ID=HOST_BUNDLE_ID \
  --format junit --output RESULT.xml scripts/view-contract.yaml
```

The two-view screen verifies main-document start/ready ordering, ordinary
path/query/fragment context, host-to-view and view-to-host messages, payloads,
view isolation, repeated-ID suppression, unlisten, document replacement,
reload, invalid/missing paths and unmount/remount. It checks observations from
both the real frontend and the public host callbacks. Changing the shared
view lifetime code also requires the four [async lifecycle flows](testing-async.md).

Record the input manifests, host/framework versions, build logs and four
Maestro results. This procedure covers arm64 simulator/emulator execution;
compiled artifact slices do not establish physical-device execution or
independent external adoption.
