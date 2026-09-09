import { homedir } from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { prepareRuntime } from './workspace.ts';

/** Keep generated/producer paths out of Rust diagnostics, file!() and debug data. */
export function runtimeBuildEnvironment(runtime: Pick<ReturnType<typeof prepareRuntime>, 'directory' | 'sourceRoot'>, targetDirectory: string, platform: 'ios' | 'android') {
  // Cargo assumes an outer compiler wrapper is transparent. Isolate outputs so
  // it cannot reuse dependencies built without our remapping/link arguments.
  // Artifact-level --incremental still skips an unchanged native build entirely.
  mkdirSync(targetDirectory, { recursive: true });
  const buildDirectory = mkdtempSync(path.join(targetDirectory, 'retained-build-'));
  const flags: string[] = [];
  if (platform === 'android') for (const argument of ['-landroid', '-llog', '-lOpenSLES', '-Wl,-z,max-page-size=16384', '-Wl,-z,common-page-size=16384']) flags.push('-C', `link-arg=${argument}`);
  for (const [source, destination] of [
    [process.env.CARGO_HOME ?? path.join(homedir(), '.cargo'), '/tauri-native/cargo'],
    [runtime.sourceRoot, '/tauri-native/producer'], [targetDirectory, '/tauri-native/build'], [runtime.directory, '/tauri-native/integration'],
  ]) flags.push(`--remap-path-prefix=${source}=${destination}`);
  // Let Cargo resolve the producer's config/env flags first. Setting RUSTFLAGS
  // here would silently suppress build.rustflags and target-specific rustflags.
  // Preserve any existing outer/workspace compiler-wrapper chain as well.
  const script = path.join(runtime.directory, 'rustc-wrapper.cjs');
  writeFileSync(script, `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const command = ${JSON.stringify((process.env.RUSTC_WRAPPER ?? process.env.CARGO_BUILD_RUSTC_WRAPPER) || null)} || args.shift();
if (args.includes('--target')) args.push(...${JSON.stringify(flags)});
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
`, { mode: 0o755 });
  let wrapper = script;
  if (process.platform === 'win32') {
    wrapper = path.join(runtime.directory, 'rustc-wrapper.cmd');
    writeFileSync(wrapper, `@"${process.execPath}" "%~dp0rustc-wrapper.cjs" %*\r\n`);
  }
  // Tauri CLI forwards CARGO_* across the Xcode/Gradle callback boundary;
  // RUSTC_WRAPPER and RUSTFLAGS do not match its RUST_* environment filter.
  return { env: { ...process.env, NODE_OPTIONS: '', CARGO_TARGET_DIR: buildDirectory, CARGO_BUILD_BUILD_DIR: buildDirectory,
    RUSTC_WRAPPER: wrapper, CARGO_BUILD_RUSTC_WRAPPER: wrapper,
    ...(process.env.RUSTC_WORKSPACE_WRAPPER !== undefined ? { CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER: process.env.RUSTC_WORKSPACE_WRAPPER } : {}),
    ...(process.env.CARGO_ENCODED_RUSTFLAGS === undefined && process.env.RUSTFLAGS !== undefined
      ? { CARGO_ENCODED_RUSTFLAGS: process.env.RUSTFLAGS.split(/\s+/).filter(Boolean).join('\x1f') } : {}),
  },
    cleanup: () => rmSync(buildDirectory, { recursive: true, force: true }) };
}

export function assertNativePaths(library: string, runtime: Pick<ReturnType<typeof prepareRuntime>, 'directory' | 'sourceRoot'>, targetDirectory: string) {
  const bytes = readFileSync(library);
  for (const prefix of [runtime.directory, runtime.sourceRoot, targetDirectory, process.env.CARGO_HOME ?? path.join(homedir(), '.cargo')]) {
    if (bytes.includes(Buffer.from(prefix))) throw new Error(`Native library retains an absolute build/source path after remapping: ${path.basename(library)} (${prefix}). Previous artifacts preserved.`);
  }
}
