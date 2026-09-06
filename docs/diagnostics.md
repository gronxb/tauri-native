# Diagnose producers and copied artifacts

`tauri-native doctor` reports toolchain, project and portable-artifact problems without running build hooks, compiling, installing tools or repairing files. Use `--json` for automation. A report has `schemaVersion: 1`, `ok`, `mode`, `platforms`, `checks` and `freshness`; each check includes an `id`, `status`, `code` and `message`, with a repair `hint` or source `diagnostics` when available. Exit status is 1 when any check fails, otherwise 0. Warnings describe checks that cannot establish a stronger guarantee. JSON is independent of terminal width and contains no tool stderr or environment dump.

## Producer checks

```sh
# In the ordinary Tauri project:
npx tauri-native doctor --platform ios
npx tauri-native doctor --platform android --json

# Select a source directory explicitly; omit --platform to check both platforms.
npx tauri-native doctor --tauri-dir ./src-tauri
```

The source flow checks Rust/Cargo, installed mobile targets, ordinary command discovery and project copy boundaries. iOS checks Xcode, both SDKs and the Apple compiler. Android checks cargo-ndk, NDK metadata/tools and its compiler. Passing discovery establishes only the [documented source subset](compatibility.md); frontend builds, dependency resolution, native compilation and application initialization remain export gates.

The CLI's Rust inspector normally compiles into a temporary cache on first `inspect` or export. If it is not prepared, doctor reports `inspector_not_prepared` and leaves the cache untouched. Run `npx tauri-native inspect` once, then rerun doctor. Doctor sets `RUSTUP_AUTO_INSTALL=0` and `CARGO_NET_OFFLINE=true` for its tool probes and Cargo metadata calls; [Rustup documents the automatic-install setting](https://rust-lang.github.io/rustup/environment-variables.html). Missing tools/targets require a separate installation command.

Generated-source exports use the same tool preflight before frontend hooks or native builds. Export retains its existing ability to install missing Rust targets; doctor never installs them. The explicit legacy `--manifest` export continues to use its existing build checks.

## Artifact-only checks

```sh
npx tauri-native doctor --artifacts './tauri-native/ios' --json
npx tauri-native doctor --artifacts './tauri-native/android' --platform android
```

With `--artifacts` and no `--tauri-dir`, doctor needs only Node and the complete copied directory. It never searches for a producer or probes Rust/Xcode/NDK. The platform is inferred from the receipt unless explicitly constrained. The CLI validates the same format, API/ABI contract, layout, headers, inventory and checksums as the React Native and Lynx package readers. Native binaries were inspected during export; this flow does not execute a native compiler or prove that an edited receipt describes a valid binary. A different CLI generator version is a warning when the declared format/API contract still passes.

Hosts can use their already-installed SDK's `readArtifacts` function without installing the CLI. Reader errors expose `.code`, and the Expo plugin preserves it before copying files. The following codes are shared with doctor and export receipt validation:

| Code | Meaning |
| --- | --- |
| `artifact_missing`, `artifact_missing_file` | The directory/receipt or a required member is absent. |
| `artifact_json`, `artifact_read` | JSON cannot be parsed or a file cannot be read. |
| `artifact_format`, `artifact_platform` | Unsupported format or unexpected platform. |
| `artifact_abi`, `artifact_api` | Unsupported ABI/header or API compatibility contract. |
| `artifact_metadata`, `artifact_layout`, `artifact_slice` | Invalid metadata, layout or required architectures. |
| `artifact_alignment` | Android receipt does not declare the supported 16 KB alignment. |
| `artifact_inventory`, `artifact_checksum`, `artifact_symlink` | Invalid inventory, changed/unexpected bytes, or a linked member. |

Tool/source failures use `tool_missing`, `tool_failed`, `rust_target_missing`, `host_platform_unsupported`, `ndk_unavailable`, `ndk_incomplete`, `ndk_compiler_missing`, `inspector_not_prepared` or `project_unsupported`. Export groups preflight failures under `preflight_failed`, retaining the individual codes and repair hints in its message.

## Compare available source evidence

```sh
npx tauri-native doctor --tauri-dir ../producer/src-tauri \
  --artifacts ./tauri-native/ios --platform ios --json
```

Only an explicit source plus generated-artifact check compares receipt fingerprints. `freshness.status` is `changed` when a recorded input differs, `recorded_inputs_match` when the available recorded hashes agree, or `unknown` when no comparison is possible. A mismatch also produces `source_changed` and exit status 1.

The receipt records selected Rust/Cargo/configuration files and built frontend bytes. Doctor compares existing frontend output without rebuilding it. Matching hashes cannot prove that unbuilt frontend source, external dependencies or unrecorded inputs are current. Artifact-only and legacy checks leave freshness `unknown`; integrity alone does not establish freshness.

## Verification

Run `nub --cwd packages/cli run test:doctor` with Rust available to prepare the actual source inspector. Scenarios exercise relocated copies without tools, damaged/incompatible receipts, missing targets/NDK/compiler, a cold inspector cache, unsupported command locations, narrow JSON output, source changes and export failure before frontend hooks. They verify unchanged files and absence of build/install calls. A separate scenario packs the CLI and both host readers, then checks a copied receipt outside the checkout with no tools on PATH. Structural receipt fixtures do not replace the native export and host gates.
