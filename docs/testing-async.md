# ABI 2 async acceptance gate

Status: verified on 2026-09-07 for #13. Artifact export, all four Release lifecycle flows and all four legacy regression flows passed. See [ADR 0005](adr/0005-async-request-sessions.md) for the measured environment and limitations.

Use the toolchains and independent RN/Lynx hosts described by their copied-artifact gates. The hosts must have the current packed SDK installed. They need no producer checkout, CLI or Rust. The QA identifiers remain `dev.taurinative.rnartifacttest` and `dev.taurinative.lynxartifacttest`; do not install over another application.

From the repository, run:

```sh
nub --cwd packages/cli run test:export:async
node scripts/prepare-async-hosts.ts /tmp/tauri-native-rn-artifact-host /tmp/tauri-native-lynx-artifact-host
```

The first command prepares the ordinary async fixture, compares real Tauri async IPC with the generated sessions through both Objective-C++ bridges, exports/validates every platform slice, compares frontend/source hashes and removes the producer. Only successful runs write `target/async-protocol/export-report.json`. The second command reads the copied artifacts through each installed SDK, installs host-owned QA screens and adds native runtime reload buttons using public framework APIs. It requires the existing baseline host templates.

Rebuild the Lynx JavaScript bundle and copy it into iOS as in its baseline gate. Run `pod install` from each host's `ios/` directory after artifact replacement, then build iOS and Android Release targets. Use a PATH without `cargo` or `rustc` for every host build and `--no-daemon` for Gradle. Follow the baseline instructions for host-specific bundle, Pod and build commands.

Install the Release products and run Maestro **serially**, once for each host/platform:

```sh
maestro --udid DEVICE test scripts/async-contract.yaml -e APP_ID=dev.taurinative.rnartifacttest
maestro --udid DEVICE test scripts/async-contract.yaml -e APP_ID=dev.taurinative.lynxartifacttest
```

The fixture holds the first direct request behind an explicit Rust release command, then verifies the second request completes first. This avoids assuming that cold-start timing will deliver two short timers in different poll batches. The flow verifies direct out-of-order results, domain errors, actual running/queued cancellation, UI interaction during blocking Rust work, embedded frontend interaction during awaited Rust work, unmount/remount while a command is pending, document reload, and real native runtime replacement while Rust workers remain alive. After replacement, the same in-process Rust counters must show the retired runtime's two running requests finishing and its queued request never starting. A process stop/relaunch cannot satisfy that check.

Cancellation suppresses delivery and removes queued work. Already running Rust code continues, including its side effects. The fixture's status command is deliberately short and read through `invokeSync` to observe occupied workers without queueing behind them. This is test instrumentation, not a requirement for producer applications.

Record artifact manifests, SDK/framework versions, Release build logs, four Maestro reports and Android APK 16 KB alignment. Keep baseline and lifecycle results separate, rerun affected gates after source changes, and remove only the uniquely identified QA apps when finished. These are test-owned hosts, not external adopters or physical-device evidence.
