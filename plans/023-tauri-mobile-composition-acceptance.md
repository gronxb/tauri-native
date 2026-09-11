# [M8] Gate release on standalone and composed Tauri Mobile parity

## Outcome

Validate the revised product contract in standalone Tauri Mobile, RN and Lynx rather than extrapolating from extracted Rust commands.

Product requirement: preserve an ordinary independently runnable Tauri desktop/iOS/Android application. RN and Lynx are optional composition layers; no producer host imports, maintained bridge, second command registry or source edits. See [ADR 0007](https://github.com/gronxb/tauri-native/blob/main/docs/adr/0007-tauri-mobile-composition.md).

## Status and dependencies

- Status: IN PROGRESS — required retained CI jobs are wired; their hosted execution and full lifecycle/device/adoption gates remain open.
- Priority: P1 · Effort: L
- Planned: 2026-09-09 against `7c055a4`
- Depends on: [#43](https://github.com/gronxb/tauri-native/issues/43) (plan 019), [#45](https://github.com/gronxb/tauri-native/issues/45) (plan 021), [#46](https://github.com/gronxb/tauri-native/issues/46) (plan 022)
- Issue: [#47](https://github.com/gronxb/tauri-native/issues/47)
- Roadmap: [#21](https://github.com/gronxb/tauri-native/issues/21)
- Local plan: `plans/023-tauri-mobile-composition-acceptance.md`

## Implementation

1. Run one useful feature with setup/state/AppHandle, async operations, Rust events, a mobile native plugin and capabilities in all six mobile combinations.
2. Compare results, denied side effects, persistence, initialization counts, native callbacks and lifecycle behavior; retain desktop independence checks.
3. Add required CI jobs, transferred-package verification and source-integrity checks with exact simulator/emulator/device evidence.
4. Update onboarding, migration, support matrix and release gates. Keep existing physical-device and independent adopter requirements open until demonstrated.

## Meaningful verification

- Same commands and frontend work in Tauri iOS/Android, RN iOS/Android and Lynx iOS/Android.
- Producer deletion, relaunch, permission denial, pending calls and teardown are exercised.
- Tests fail on any missing native scenario instead of skipping it.

Native execution is required for lifecycle/plugin claims. Compilation, generated text and MockRuntime IPC are insufficient. Record exact commands and tool versions, keep failure reports distinct from completed evidence, and preserve authored-source hashes on success and failure. Existing command/host regressions must still pass when their execution paths change. New native gates in this plan are deliverables, not claims that they already exist.

## Acceptance

- [x] Six mobile executions and standalone desktop regression have assertion-bearing evidence.
- [x] Package-only consumers need no producer source or Rust.
- [ ] No full mobile-composition release claim precedes the new gates.

The [support matrix](../docs/retained-support.md) maps the original iOS/Android
and four packed RN/Lynx executions to exact native evidence. The
[read-only audit](../docs/evidence/retained-support-audit-2026-09-11.json) verifies
their ten common runtime scenarios, State/setup results, real location-note
outcomes, separate ACL/OS denial and unchanged fourteen-file producer. Packed
composed consumers built without producer source/Rust and executed default
package-owned startup as well as the instrumented acceptance layout.

These are recorded per-stage executions, not a new CI run or a completed final
parity gate. Activity recreation, broader navigation/lifecycle coverage,
transferred-package CI at one validated revision, physical devices and two
independent adopters remain required. The [migration guide](../docs/migration.md#moving-to-retained-tauri-mobile)
documents format 2 composition and removing the addon without producer edits.

## Android Activity recreation — 2026-09-11

[Android recreation evidence](../docs/evidence/retained-activity-recreation-2026-09-11.json)
adds a paired ordinary Tauri / packed RN / packed Lynx comparison: fifteen
native UI flows and six actual Activity recreations after location grant,
preserving process/state/setup and note data with new Activity/WebView objects.
Composed listeners retire and new events arrive once. This reuses an existing
retained artifact; it is not another export or completed cross-platform parity.
Fresh/pending permissions, Expo recreation, navigation/rotation, retained CI,
physical devices and adopters remain open. Earlier failed attempts remain
explicit, including unresolved standalone initial permission-response and
post-recreation link UI failures.

## Android permission requests after recreation — 2026-09-11

[Native evidence](../docs/evidence/retained-recreation-permissions-2026-09-11.json) records the original Tauri/RN/Lynx stale launcher failure
and its correction in the exported dependency copy. A fresh source-free Release
export passes twelve UI flows; packed RN/Lynx add fourteen covering denial,
recreation, grant, save and deep link. All fourteen producer hashes, cache/failure
recovery and packaged ELF/APK alignment checks pass. This is scoped Android
evidence; pending callbacks across recreation, Expo recreation, full retained
CI/parity and physical-device/adopter acceptance remain open.

## Pending Android permission callbacks — 2026-09-11

[Native evidence](../docs/evidence/retained-pending-recreation-2026-09-11.json) adds eighteen
packed RN and Lynx Release/R8 UI flows. A test-only broadcast recreates the Activity
while the actual Tauri geolocation permission dialog remains visible. OS denial
and grant each complete the original Tauri callback on a replacement Activity;
retired renderer continuations save no sentinel note. State/setup remain 45/1/1,
old listeners reach zero, and a new location save/deep link works. The existing
producer-deleted artifact is reused; no new production runtime change is claimed.

The same gate fails with the previous RN artifact: after real recreation and OS
denial, no original callback completion is recorded. That failure remains
separate from successful acceptance. RN-owned permissions, Expo recreation,
process death, broader navigation/channel behavior, retained CI and device/adopter
gates remain open; this does not close the issue or establish full release parity.


## Transferred SDK acceptance — 2026-09-11

Forty-one Android Release UI flows (RN 24, Lynx 17) pass with transferred SDKs and fresh external dependencies. Both include the generated default startup. Changed/missing CI inputs are rejected without local repacking.

[Evidence](../docs/evidence/retained-ci-transfer-android-2026-09-11.json) records SDK/artifact/producer integrity and the separate initial bundle failures. The earlier runtime export is reused; required retained CI at one revision, Linux/x86_64 execution and final lifecycle/device/adopter acceptance remain open.

## Required retained CI wiring — 2026-09-11

The validation workflow now requires `retained-producer`, `retained-ios` and
`retained-android` alongside the existing producer/native jobs. The retained
producer consumes the same packed CLI, runs both desktop contracts, prepares
ordinary apps and exports Release runtimes, verifies cache/failure recovery and
deletes the mobile producers. Receiving jobs execute the transferred ordinary
app, retained native client, RN, Expo CNG and Lynx. Android also requires both
renderers' recreation, fresh-permission and pending-permission scenarios.

Final receipts bind native reports and successful UI results to the source
commit, upstream package producer, retained archive and exact package/export
hashes. Failed, cancelled, missing or stale jobs cannot produce a candidate.
[Validation commands](../docs/validation.md#running-the-gates) document transfer
and execution. This implements the workflow; a complete hosted retained run
remains required. Local preparation/consumption evidence is recorded separately
in [the workflow evidence](../docs/evidence/retained-ci-workflow-android-2026-09-11.json).
Linux/x86_64, iOS/Expo transfer execution and remaining lifecycle/device/adopter
acceptance are not inferred from wiring or receipt tests.

## iOS transfer and hosted verification — 2026-09-11

[Fresh iOS evidence](../docs/evidence/retained-ci-workflow-ios-2026-09-11.json)
adds ordinary/native retained preparation and 20 source-free receiving UI flows.
The original fourteen files and every transferred app/artifact byte are unchanged.
The first complete workflow attempt at `396e3c9` failed in the CLI typecheck
because the independent fixture's native-plugin JS packages were not installed.
Locked fixture installation now precedes the existing checks. The corrected
hosted package producer passes, and [downloaded inputs are verified](../docs/evidence/retained-hosted-producer-2026-09-11.json)
against its commit, archive hash and three package identities/hashes. The failed
run and skipped native jobs remain explicit. Retained producer and receiving
jobs still need their own success; a complete corrected run remains required. RN/Expo/Lynx iOS transfer checks remain
separate from this native-client evidence.

The maintainer confirmed that physical devices and two independent project
evaluations are not yet prepared. Those final acceptance items remain open;
implementation and hosted validation continue.

The [existing hosted Android receiving job](../docs/evidence/retained-hosted-legacy-android-2026-09-11.json)
has since completed at `002ee3a`: thirteen downloaded UI results, original/changed
feature reports and standalone ABI 2 execution match the producer receipt and
package hashes. This verifies the existing path on Linux/x86_64/16 KB. Retained
ABI 3 and later lifecycle gates remain separate; no candidate is certified yet.

The [retained producer receipt and archive](../docs/evidence/retained-hosted-producer-complete-2026-09-11.json)
now also pass verification at `002ee3a`: all 139 listed iOS/Android export files,
ordinary app binaries, source integrity and cache/failure-recovery receipts match.
Both desktop contracts passed in that job and mobile producers were deleted.
The receiving retained jobs are still required to establish native execution;
this is preparation evidence, not final parity or later-revision acceptance.

## Expo Activity recreation — 2026-09-11

[Native evidence](../docs/evidence/retained-expo-recreation-2026-09-11.json) records
33 transferred-SDK Expo Android Release/R8 UI flows: normal 9, fresh Tauri
permissions 11 and pending Tauri permissions 13. Each executes two actual
Activity recreations. Tauri State/setup remain 45/1/1; OS denial and grant each
complete the original callback once, and retired renderers save no sentinel.
The real Expo application initializes once, native modules follow all three
Activities and are completely destroyed at final removal. File persistence,
back/deep-link forwarding and original Tauri IPC after removal pass. All fourteen
producer files and input bytes remain unchanged; the previous export is reused.

The first normal attempt failed at a missing test-only Close RN control, after
its earlier eight flows passed. The corrected complete run is recorded separately;
no production runtime fix is claimed. Android CI now requires all three Expo
recreation modes and rejects missing module lifecycle/cleanup evidence. Four
receipt tests and CLI/scripts typechecks pass. The existing hosted run at
`002ee3a` continues independently and does not certify this new revision.

Expo CNG recreation, bare-RN permission recreation, process death, broader
navigation/channel/source forms, full same-commit hosted validation, physical
devices and independent project evaluation remain open. The maintainer's device
and evaluator availability remains unchanged. This increment closes no issue.

## Renderer-owned permissions across recreation — 2026-09-11

[Thirty additional native UI flows](../docs/evidence/retained-renderer-permission-recreation-2026-09-11.json)
exercise actual RN and Expo permission APIs in package-owned Expo composition.
Four real recreations retain Tauri State/setup 45/1/1. Previous location requests
complete at the OS without reaching retired listeners; new camera requests after
resume receive only their own denial/grant. Expo modules, persistent files,
back/deep-link forwarding and final cleanup pass. Original producer and input
artifact/tarball bytes stay unchanged. The copied SDK only adds observation logs.

Failed ANR, paused-effect timing and Tauri permission-cache assumptions are
preserved; corrected full runs pass without a production runtime change. Both
owner modes are mandatory in Android CI, with five receipt tests rejecting
missing modes, duplicate/stale/mixed results and incomplete module cleanup.
CLI/scripts typechecks pass. These are local API 37 arm64/16 KB runs, separate
from bare-RN, Expo CNG recreation and the still-running hosted revision.
Remaining lifecycle, same-commit hosted, device and evaluation gates stay open.

## Scope and constraints

Change only the CLI/runtime integration, package-owned native hosts, fixtures, verification and documentation needed for this outcome. Desktop-only APIs retain upstream platform restrictions. Unsupported source forms or third-party plugins require diagnostics and explicit support evidence. A failed experiment must not silently weaken the Tauri Mobile requirement or remove rejection checks.

Implementation is authorized directly on `main` in incremental commits, without PRs. Do not publish packages as part of this task.
