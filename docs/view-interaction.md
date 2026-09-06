# Local context and view events

Both host packages expose the same `TauriView` interaction props. The host keeps
its normal RN or Lynx layout styles. The producer remains an ordinary Tauri
frontend with standard URL parsing and `@tauri-apps/api/event` imports.

| Prop | Contract |
| --- | --- |
| `path` | A packaged path beginning with `/`, including an optional query and fragment. Defaults to `/index.html`. Changing it loads a fresh document. Remote URLs, authority paths and parent traversal are rejected. |
| `onLoadStart({ url })` | A main-document navigation has started. |
| `onReady({ url })` | The main document and injected bridge have loaded. Application subscriptions/data may still be pending. |
| `onLoadError({ url, code, message })` | An invalid path, blocked navigation, missing asset, navigation failure or message error. A subresource failure can coexist with a loaded document. |
| `message` | `{ id, event, payload? }`. Send to a ready view with a new nonempty ID for each notification. Re-rendering the most recent ID does not resend it. A document change does not replay the most recent notification. |
| `onEvent({ event, payload })` | A standard scoped frontend emission from this view. Payload is a JSON value; omitted payload becomes null. |

Messages sent before readiness are not queued for a future document. An
attached view reports `not_ready`; a view that has not mounted cannot deliver
host callbacks yet. Use an application-level ready event when a particular
subscription must exist before sending. A delivery acknowledgement does not
mean an application handler has finished, and there is no durable delivery or
retry protocol. Changing a view's `path` or removing it releases the prior
document's Rust session and event subscriptions.

For example, an ordinary frontend can identify the requested document and
announce a subscription:

```ts
import { listen, emitTo } from '@tauri-apps/api/event';

const target = { kind: 'Webview', label: 'main' } as const;
const documentId = new URLSearchParams(location.search).get('documentId');
const unlisten = await listen('selection', ({ payload }) => {
  // Update the application's selection using payload.
}, { target });
await emitTo(target, 'feature-ready', { documentId });
// Call unlisten() when the feature no longer needs this subscription.
```

The host renders `path="/index.html?documentId=42#details"`, observes
`feature-ready` through `onEvent`, then sets
`message={{ id: 'selection-1', event: 'selection', payload: { item: 7 } }}`.
The frontend needs its ordinary desktop event permission (the acceptance
fixture grants `core:event:default` to `main`). Export preserves that authored
configuration. It does not implement Tauri's general capability/ACL engine.

## Exact supported subset

The verified standard event calls are `listen`, `once`, `emitTo` and the
returned unlisten function, explicitly targeting
`{ kind: 'Webview', label: 'main' }`. Each embedded document is an independent
scope. Two host views do not address one another, even though both use the
ordinary `main` label.

Default/global `listen`, `emit`, string/AnyLabel targets, other labels,
Window/App targets, `tauri://` system events, Rust `AppHandle` emission and
channels remain unsupported. They are not silently converted into local
events. Supported names use ASCII alphanumerics, `/`, `:`, `_` and `-`.
Payloads follow JSON serialization. Event callbacks run asynchronously, with
no promised order among different subscriptions. Callback registration is
limited to 64 per document; unlisten, once and teardown release registrations.

This extension is newer than the original experimental 0.1.0 host packages.
Use matching current host SDKs; event support does not expand Rust command or
runtime compatibility. See [ADR 0006](adr/0006-view-context-events.md) and the
[acceptance procedure](testing-views.md).
