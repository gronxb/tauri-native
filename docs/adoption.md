# Independent onboarding and the 1.0 candidate

The 1.0 adoption gate remains open until at least two developers complete the documented workflow with their own ordinary Tauri projects. The repository's disposable React Native, Expo and Lynx test hosts establish automated integration evidence; they do not count as independent adopters.

This checkout prepares **1.0.0-rc.0** for all three packages through Changesets prerelease mode. It remains on the experimental npm channel if published. Use tarballs from the successful validation workflow for the exact revision until registry publication is confirmed; preparing this version does not mean its checks have passed. Use the candidate packages and compatibility matrix from the same revision. A successful notebook example does not establish support for an application's managed state, runtime handles, plugins or window APIs. Start with `tauri-native inspect`, resolve reported incompatibilities, and retain unsupported cases in the evaluation record.

See [migration from 0.1](migration.md) for API changes and [candidate validation](validation.md) for required automated evidence.

## Walkthrough

1. Record the ordinary Tauri project's starting commit and toolchain versions. Run its normal desktop build and tests before installing the CLI.
2. Install the candidate CLI in that project. Run `tauri-native inspect`, then export the intended platforms. Keep the complete command output and inspect the producer diff.
3. Copy each complete platform export into a separate native host. Install the matching candidate host SDK and follow its integration guide. The native host receives binaries, frontend assets and generated TypeScript contracts.
4. Remove the disposable producer checkout from the test environment and build the host with a PATH that cannot find `cargo` or `rustc`. Exercise both direct native calls and the embedded frontend, including a domain error and leaving the view during pending work.
5. Change one supported Rust command in the producer, export again and replace the complete received directories. Rebuild the host, verify the changed behavior, and confirm that the desktop application still works.
6. Remove the CLI installation and generated output in a disposable producer copy, then run the project's normal desktop build again. Retain the final authored-source diff and the tested artifact/package hashes.

The permitted producer installation diff is the CLI dependency in `package.json` and its JavaScript lockfile. Export must preserve authored Rust/frontend files, Cargo manifests and lockfiles, command registration and Tauri configuration. Generated ignored output is disposable. Any required custom Rust SDK, bridge macro, command registry, host branch or shared producer source in the consumer is a failed adoption gate and needs an implementation issue.

## Evaluation record

Complete one record for each independent project. Share only details the evaluator has authorized for publication; private project names, source code and contact information are not required.

| Field | Evidence to record |
| --- | --- |
| Evaluator and project | Consented public identifier, or an anonymized record with maintainer-held verification |
| Candidate | Source revision, package versions and SHA-256 hashes |
| Environment | OS, Xcode/NDK, Rust, Node, Tauri/API, RN/Expo or Lynx versions |
| Starting application | Existing domain behavior, registered commands and ordinary desktop build result |
| Documentation-only setup | Steps followed, elapsed setup time, any maintainer intervention and every undocumented step |
| Producer changes | Authored-source diff before/after installation and export; explain each changed file |
| Compatibility | Commands/APIs that worked and each diagnostic, unsupported case or failure |
| Artifact transfer | Received manifest hashes and confirmation that the consumer has no producer source |
| Native builds | Release build logs, Rust-free PATH check, target architectures and page-size/alignment checks |
| Runtime behavior | Direct and embedded success/error paths, persistence if used, navigation, pending work and relaunch |
| Rust refresh | One authored behavior change observed on desktop and each evaluated native host |
| Desktop independence | Normal build after removing CLI/generated output in the disposable copy |
| Measurements | Setup/build time, complete app/package size and startup method, with cache/device conditions |
| Reproduction | Consented issue/run links and unresolved defects |

A walkthrough can fail and still provide useful evidence. Keep its failures visible, fix the responsible issue, and rerun the affected scenario. Do not convert maintainer-assisted or test-owned runs into documentation-only independent adoption.

## Release decision

A reviewable candidate contains matching CLI/host packages, changesets and migration notes, the bounded support matrix, and linked validation for that exact candidate. Required CI jobs, physical-device RC checks and independent onboarding records must be complete before a stable 1.0 release is represented as ready.

The release checklist is intentionally incomplete until evidence exists:

- [ ] First independent documentation-only integration and producer diff reviewed.
- [ ] Second independent documentation-only integration and producer diff reviewed.
- [ ] Required package, source-integrity, compatibility and native jobs passed for the candidate.
- [ ] Physical iOS and Android RC checks recorded, including platform signing/distribution conditions.
- [ ] Unsupported APIs and migration guidance reflect the candidate's actual behavior.
- [ ] Maintainer has authorized stable publication through the documented release process.

Outreach requires maintainer authorization. This document does not authorize contacting developers, publishing private evaluation material, or claiming that independent adoption has occurred.
