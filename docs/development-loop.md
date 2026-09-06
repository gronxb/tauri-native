# Incremental export and watch

Keep the producer and host as separate projects. Incremental export is opt-in; it changes how the CLI prepares an export, while the host still consumes a complete platform directory.

```sh
# Reuse a validated result when recorded build inputs are unchanged.
npx tauri-native export ios --incremental
npx tauri-native export android --incremental

# Watch implies incremental export. Select the complete host artifact folder
# explicitly if writing directly into a separate host checkout.
npx tauri-native export ios --watch --output-dir ../mobile-app/tauri-native/ios
npx tauri-native export android --watch --output-dir ../mobile-app/tauri-native/android

# Rerun frontend and Cargo build steps even if the CLI result cache matches.
npx tauri-native export android --incremental --force
```

Use separate output directories for iOS and Android. The ordinary `export` command without these options retains its build-every-time behavior. Incremental/watch mode supports generated exports from ordinary Tauri projects; the optional legacy `--manifest`/`--header` route does not use this cache.

## What is reused

The CLI hashes authored file bytes and permissions, installed JavaScript dependency contents, Cargo manifests/lockfiles/features, applicable Cargo/toolchain configuration, the build environment, platform/tool versions, and the CLI/native adapter implementation and ABI. Environment values contribute only to a hash; cache records do not contain an environment dump. The result cache also records the published manifest hash and validates the complete artifact inventory before a hit.

A matching result skips frontend hooks and native builds. On a miss, the frontend hook runs in a disposable copy, then the generated workspace is synchronized into a persistent CLI-owned cache without rewriting unchanged files. Cargo decides which native compilation units need rebuilding. A frontend-only edit can therefore rebuild assets while reusing unchanged Rust compilation. There is no separate handwritten list of Rust source extensions that could miss a local data dependency.

Cache data lives under `src-tauri/target/tauri-native/cache/`; it is disposable and never travels with host artifacts. Cargo build products live under `src-tauri/target/tauri-native/builds/`, isolated by output directory so simultaneous exports cannot overwrite each other's slices. A CLI result-cache miss or `--force` reruns Cargo, which may still reuse its own valid compiled dependencies.

The receipt's small `source` fingerprint set is provenance, not this cache key. [Doctor's source comparison](diagnostics.md) continues to report only the evidence available in the portable receipt.

## Input boundary

Opt into reuse for reproducible builds whose inputs are the copied project, installed dependencies, recorded Cargo/toolchain configuration and environment. Frontend hooks must regenerate `frontendDist` from those inputs. Time, remote services, arbitrary files outside that boundary, mutable compiler/registry installations under unchanged versions, and empty-directory presence are not certified cache inputs. Use normal export or `--force` when external build inputs have changed; use the underlying build tool's clean/rebuild procedure if its own cache also needs invalidating.

Exact Cargo target directories, Tauri generated directories, the selected output/staging/lock paths, and `.git` are excluded. Built frontend output is excluded when a build hook regenerates it; without a hook, frontend files remain inputs. An authored `src/gen/` or `src/target/` directory remains tracked. Installed dependencies are hashed by content, including linked local files. Source paths with spaces and macOS `/tmp`/`/var` aliases retain the same output exclusion behavior.

## Watch behavior and failure recovery

Watch polls input content, coalesces edits, and runs one export at a time. A second process attempting to build the same output receives `output_busy`. If source changes while the disposable copy or artifact is being built, that attempt fails with `inputs_changed`; the old complete artifact remains published and watch retries the latest edit. A failed frontend/native build also leaves the old artifact intact and waits for the next edit.

The CLI verifies the captured copy before transforming it and checks source inputs again before atomic promotion. Generated output does not trigger an export loop. Restart watch after changing the producer root or installing/selecting a different global toolchain. Ctrl-C stops after the current export finishes and starts no further build. A forced process termination can leave a sibling `<output>.lock` and staging directory; confirm its recorded PID has stopped before removing that lock and retrying. See [publication behavior](artifacts.md#publication-and-failure-behavior).

## Refresh the host

After a successful export, copy the **whole** platform directory if the CLI did not write directly to the host's dedicated artifact folder. Re-run the host's documented artifact integration step when needed (for example, Expo prebuild), then rebuild and reinstall/relaunch the host so it packages the updated assets and native libraries. Even a frontend-only change is still a packaged-asset change. Watch does not provide host HMR, an embedded development server, OTA delivery or replacement of a loaded native library.

## Verification

`nub --cwd packages/cli run test:watch` requires the verified macOS/Xcode/Rust/mobile-target/NDK toolchain. It installs a packed CLI in a temporary project, measures ordinary/incremental/no-change/frontend/Rust exports, and exercises lock/features/CLI/ABI/platform invalidation with actual builds. It then checks real watch edits, debounce, generated-directory exclusion, failed-build recovery, changes during a held build and graceful shutdown. Reports and logs are written to `target/incremental-export/`.

`test:export:ios` and `test:export:android` separately execute an edited Rust response after incremental re-export, relocation, producer deletion and host rebuild with Rust absent from PATH. Select a running simulator with `IOS_SIMULATOR_UDID` and a 16 KB emulator with `ANDROID_SERIAL` when multiple devices are available. The native gates compile/inspect every artifact architecture and execute only the selected simulator/emulator architecture.

## Recorded local sample — 2026-09-07

The packed-CLI gate on this Mac used rustc 1.97.1 (8bab26f4f 2026-07-14), cargo-ndk 4.1.2 and Node v24.15.0. These are individual Android runs of the same fixture on the same toolchain; load and existing Cargo caches affect elapsed time.

| Scenario | Elapsed |
| --- | --- |
| Ordinary export, first build | 37.28 s |
| Ordinary export, repeated with warm Cargo dependencies | 10.21 s |
| Incremental export, unchanged inputs | 0.60 s |
| Frontend edit, native compilation reused | 1.66 s |
| Rust edit, native compilation refreshed | 7.49 s |

The gate asserts actual hook execution, native compilation reuse, artifact changes and failure preservation. It also concurrently exports two different compiled environment values and verifies that every native slice belongs to the correct output. It does not use timing thresholds to determine correctness.
