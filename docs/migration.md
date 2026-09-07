# Migrating from the 0.1 proof of concept

The 1.0.0-rc.0 candidate is experimental and requires matching CLI and host SDK packages from the same validated candidate. The source checkout's version does not mean that version is already available on npm. Use the tarballs from its successful `release-candidate` workflow artifact until publication has been verified.

## Producer and artifact ownership

The default CLI route now reads an ordinary Tauri project, discovers its existing registered Rust commands and generates the native adapter in a disposable copy. Run `tauri-native inspect` before export to see the supported command set and actionable source diagnostics. Neither the frontend nor the Rust code needs tauri-native imports, bridge macros or another command registry.

If an earlier integration extracted a custom Rust core, it can remain an ordinary dependency of the Tauri application. The explicit legacy `--manifest` export route also remains available for the retained ABI 0 calculator fixture. Migrating to source export does not require deleting application modules; it requires using the ordinary Tauri handler and staying within the [compatibility scope](compatibility.md).

Copy the **entire** new platform directory when refreshing a host. In addition to native binaries and frontend assets, it contains the artifact manifest, integrity inventory and generated command contract. Do not combine an old framework with new metadata or update only the frontend. Validate the receiving directory with `tauri-native doctor --artifacts <directory>` using the option syntax in the [CLI guide](../packages/cli/README.md).

For Expo, configure `artifactsDir` to a host-owned directory containing `ios/` and `android/` exports. Prebuild reads those artifacts and the installed SDK; it no longer needs a path to the Tauri source checkout. Bare RN and Lynx should likewise remove host build steps that run Cargo or reach into a producer workspace once the copied-artifact integration is complete.

## Invocation and lifetime

`invoke` is now asynchronous. Code that previously read its return value immediately must await the request:

```ts
import { invoke, invokeSync } from '@tauri-native/react-native';

const request = invoke('greet', { name: 'Ada' });
const result = await request;
if (result.ok) console.log(result.value);
else console.error(result.error);

// Explicit compatibility API for short, deliberately blocking calls:
const immediate = invokeSync('greet', { name: 'Ada' });
```

Lynx exposes the same methods from `@tauri-native/lynx`; invoke native APIs from the background scripting thread. Generated `createCommands(invoke)` wrappers add command and serde argument/result types to the same request protocol.

Domain failures resolve to `{ ok: false, error }`. Transport failures reject the Promise. A request exposes `cancel()` and accepts an AbortSignal through the invocation options. Cancellation discards queued or late results; it does not interrupt Rust already running or undo writes. Re-export with the candidate CLI to use ABI 2 sessions and nonblocking embedded invocation. Older ABI 0/1 artifacts retain their compatibility behavior; upgrading only the JavaScript SDK does not upgrade their exported protocol.

The ordinary frontend keeps `@tauri-apps/api/core.invoke` and its usual Promise value/rejection shape. Do not change frontend imports to the host SDK. Each view/document has its own lifetime. Remounting, navigation and native runtime replacement retire pending delivery to the old session.

## Scoped frontend integration

Use the [view interaction contract](view-interaction.md) for local paths, readiness/errors and scoped JSON messages. The supported standard event subset uses an explicit Webview target named `main`; global/window events and the full desktop runtime are not emulated. `appDataDir()` maps to host-private storage shared by native invocation and the embedded document, as described in [Fieldnotes](examples/fieldnotes.md#application-data-directory-contract).

These changes do not add general Tauri plugin/ACL support, managed State, runtime handles or desktop window APIs. An unsupported diagnostic is a compatibility boundary to evaluate, not a reason to add producer-side bridge shims. Record real onboarding failures using the [adoption procedure](adoption.md).
