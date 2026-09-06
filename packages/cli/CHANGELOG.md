# @tauri-native/cli

## 1.0.0-rc.0

### Major Changes

- Introduce source-preserving exports from ordinary Tauri projects and portable iOS/Android artifacts consumed by independent native hosts.

  The CLI discovers registered commands, generates the adapter and TypeScript contracts, validates complete XCFramework/JNI/frontend distributions, and provides inspect, doctor, incremental export and watch commands. React Native, Expo CNG and Lynx consume copied artifacts without producer source or Rust tools in the host build. ABI 2 adds nonblocking invocation, cancellation of delivery, request/document/runtime lifetimes, scoped view events and a verified appDataDir adaptation.

  This release candidate remains experimental. Compatibility is limited to the documented Tauri API and native host matrix. Runtime handles, managed state, general plugins/ACLs, windows and global events remain unsupported. Re-export with the matching CLI for ABI 2; the old synchronous API is available explicitly as invokeSync for migration. Independent onboarding, required CI and physical-device RC evidence remain release gates; a candidate version does not certify them.

## 0.1.0

### Minor Changes

- 13605b4: Add Android export and React Native and Lynx native host support.

## 0.0.2

### Patch Changes

- 83129bf: Set up automated npm releases for all public packages.
