# Migrating tauri-native integrations

## Moving to retained Tauri Mobile

The retained development path keeps a real, independently runnable Tauri app
and adds RN/Expo or Lynx in an external consuming project. It uses **format 2 /
ABI 3**. The older limited adapter uses **format 1 / ABI 0–2**; its migration
instructions continue below. A receipt version edit or JS package upgrade cannot
turn an adapter binary into a retained runtime.

1. Keep the ordinary producer's Rust, frontend, Tauri configuration, capabilities
   and plugin sources. Confirm that its normal Tauri desktop/mobile build works
   and check the [verified support matrix](retained-support.md). The producer
   needs no renderer imports, bridge macros or host-detection branches.
2. Use matching packed development CLI/SDK packages. Define a separate native
   caller policy with exact original WebView labels and command grants, then
   re-export the original producer with `--runtime retained --caller-policy`.
   The [artifact guide](retained-artifacts.md#export-and-consume) contains complete
   iOS/Android commands. Original Tauri capabilities and OS permissions still
   apply to delegated calls.
3. Copy the complete platform export to the consumer, including its original
   native project, runtime libraries, native plugin dependencies and receipt.
   Run `tauri-native doctor --artifacts <directory> --platform ios` (or `android`)
   and keep that input immutable. Generate a new output directory with the
   [RN composer](../packages/react-native/RETAINED.md) or
   [Lynx composer](../packages/lynx/RETAINED.md). The consumer builds native code
   and its renderer bundle without the producer checkout or a Rust toolchain.
4. In the renderer, replace adapter entry-point calls with `openTauriSession`
   from the SDK's `/retained` entry. Open a declared caller after the original
   runtime is ready; close sessions/listeners when their owner retires. Invokes
   retain the `{ ok, value/error }` envelope. Use the retained `TauriView` to
   borrow the original WebView; adapter URL/path/navigation props do not apply.
   The ordinary frontend keeps its existing `@tauri-apps/api` calls.
5. For Expo, put the retained SDK plugin first and run `tauri-native-prebuild`
   for generation and regeneration. Its custom template preserves Tauri's
   native owner. Follow the [Expo configuration example](../packages/react-native/RETAINED.md#expo-config-plugins-and-native-regeneration);
   the old adapter plugin configuration and direct `expo prebuild` are not a
   retained migration.
6. Verify original frontend behavior and direct commands, separate ACL/OS
   denial, shared state, plugins and teardown in the generated consumer. Keep
   the previous complete artifact/consumer output until the new one passes.
   Roll back by selecting the previous matching artifact and integration. To
   remove the addon, remove the consumer's generated integration/dependencies;
   there is no producer-side bridge to unwind.

This documents the implemented development route. Physical-device and
independent onboarding evidence remain open; see [plan 023](../plans/023-tauri-mobile-composition-acceptance.md).

## Limited-adapter migration

The 1.0.0-rc.0 candidate is experimental and requires matching CLI and host SDK packages from the same validated candidate. The source checkout's version does not mean that version is already available on npm. Use the tarballs from its successful `release-candidate` workflow artifact until publication has been verified.

### Producer and artifact ownership

The default CLI route now reads an ordinary Tauri project, discovers its existing registered Rust commands and generates the native adapter in a disposable copy. Run `tauri-native inspect` before export to see the supported command set and actionable source diagnostics. Neither the frontend nor the Rust code needs tauri-native imports, bridge macros or another command registry.

If an earlier integration extracted a custom Rust core, it can remain an ordinary dependency of the Tauri application. The explicit legacy `--manifest` export route also remains available for the retained ABI 0 calculator fixture. Migrating to source export does not require deleting application modules; it requires using the ordinary Tauri handler and staying within the [compatibility scope](compatibility.md).

Copy the **entire** new platform directory when refreshing a host. In addition to native binaries and frontend assets, it contains the artifact manifest, integrity inventory and generated command contract. Do not combine an old framework with new metadata or update only the frontend. Validate the receiving directory with `tauri-native doctor --artifacts <directory>` using the option syntax in the [CLI guide](../packages/cli/README.md).

For Expo, configure `artifactsDir` to a host-owned directory containing `ios/` and `android/` exports. Prebuild reads those artifacts and the installed SDK; it no longer needs a path to the Tauri source checkout. Bare RN and Lynx should likewise remove host build steps that run Cargo or reach into a producer workspace once the copied-artifact integration is complete.

### Invocation and lifetime

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

### Scoped frontend integration

Use the [view interaction contract](view-interaction.md) for local paths, readiness/errors and scoped JSON messages. The supported standard event subset uses an explicit Webview target named `main`; global/window events and the full desktop runtime are not emulated. `appDataDir()` maps to host-private storage shared by native invocation and the embedded document, as described in [Fieldnotes](examples/fieldnotes.md#application-data-directory-contract).

These changes do not add general Tauri plugin/ACL support, managed State, runtime handles or desktop window APIs. An unsupported diagnostic is a compatibility boundary to evaluate, not a reason to add producer-side bridge shims. Record real onboarding failures using the [adoption procedure](adoption.md).
