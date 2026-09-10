import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** An ordinary fixture variant, authored before export/source hashing. */
export function prepareDependencySelection(producer: string, run: (label: string, command: string, args: string[], cwd: string) => string) {
  const manifest = path.join(producer, 'src-tauri/Cargo.toml');
  const source = readFileSync(manifest, 'utf8');
  assert(source.includes('tauri-plugin-geolocation = "=2.3.3"'));
  writeFileSync(manifest, source.replace('tauri-plugin-geolocation = "=2.3.3"', 'tauri-plugin-geolocation = { version = "=2.3.3", optional = true }') + `
[features]
native-location = ["dep:tauri-plugin-geolocation"]

[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
desktop-opener = { package = "tauri-plugin-opener", version = "=2.5.5" }
`);
  const configFile = path.join(producer, 'src-tauri/tauri.conf.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  config.build.features = ['native-location'];
  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
  // Resolve the variant's ordinary dependencies before the exporter starts.
  // The exporter itself must use --locked --offline and preserve this lockfile.
  run('dependency-selection-fixture', 'cargo', ['metadata', '--format-version', '1', '--manifest-path', manifest,
    '--features', 'tauri/custom-protocol,native-location'], producer);
  assert.match(readFileSync(path.join(producer, 'src-tauri/Cargo.lock'), 'utf8'), /name = "tauri-plugin-opener"/);
}
