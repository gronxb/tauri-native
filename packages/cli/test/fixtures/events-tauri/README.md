# Ordinary scoped Tauri events

Overlay this fixture on `standard-tauri` before building. The same frontend uses
the standard event/core modules and ordinary URL parameters on desktop and in
embedded hosts. It has no host SDK imports or host detection. The `record`
command optionally writes a QA result when `TAURI_EVENT_REPORT` is configured by
the desktop test runner. Native hosts observe `fixture-ready` and `reply` events.

The desktop capability grants the ordinary event API. Embedded hosts support
only the explicitly documented `Webview/main` subset, not general Tauri ACLs.
