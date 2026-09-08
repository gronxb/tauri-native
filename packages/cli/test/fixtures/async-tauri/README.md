# Ordinary asynchronous Tauri fixture

This directory overlays `standard-tauri` in `test/native-export/async.ts`. The harness adds an ordinary pinned Tokio dependency with its timer feature and resolves the fixture lockfile before taking the authored-source baseline. The application has one normal Tauri command registry, serde values/errors and frontend imports exclusively from `@tauri-apps/api/core`.

`delayed` actually awaits a Tokio timer. `blocking` occupies its calling Rust thread. `held` waits for a `release` command, proving out-of-order completion without assuming a particular cold-start or polling time. `work_status` exposes started/completed side effects so native QA can distinguish cancelled queued work from running work that finishes after its session closes. These controls and counters exist only in the test application. The frontend uses ordinary buttons and page reload; it has no native-host detection or custom bridge imports.

The export gate builds the ordinary Tauri library, compares its real async IPC with both generated Objective-C++ session consumers, exports all iOS/Android slices, checks unchanged frontend bytes and producer source, copies artifacts and deletes the producer and CLI installation. The host lifecycle gate consumes those copies separately.
