# Ordinary Tauri Mobile Fieldnotes

This producer uses only ordinary Tauri and the official geolocation 2.3.3 and deep-link 2.4.10 plugins. It saves location-tagged notes in application storage, observes native deep links and retains the runtime/state/plugin-ACL baseline. There are no RN, Lynx or tauri-native imports or maintained bridges.

From this directory, install dependencies with `npm install`, then use `npm run tauri -- dev`, `npm run tauri -- ios dev` or `npm run tauri -- android dev` with the standard Tauri tools. Initialize the mobile platform with the corresponding `ios init` / `android init` command first. The desktop app retains notes/state; upstream geolocation is mobile-only. The iOS usage description and deep-link configuration are part of the ordinary producer.

The location controls exercise Tauri capability denial separately from actual OS permission denial/grant. Saving a note needs OS location permission and a native position. The custom `tauri-fieldnotes://` scheme exercises the original Tauri native lifecycle. Do not treat fixture creation or compilation as native acceptance: #43/#47 track the required execution evidence.
