import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { prepareRuntime } from './workspace.ts';

/** Keep generated/producer paths out of Rust diagnostics, file!() and debug data. */
export function runtimeBuildEnvironment(runtime: Pick<ReturnType<typeof prepareRuntime>, 'directory' | 'sourceRoot'>, targetDirectory: string, platform: 'ios' | 'android') {
  const flags = process.env.CARGO_ENCODED_RUSTFLAGS !== undefined ? process.env.CARGO_ENCODED_RUSTFLAGS.split('\x1f').filter(Boolean) : (process.env.RUSTFLAGS ?? '').split(/\s+/).filter(Boolean);
  if (platform === 'android') for (const argument of ['-landroid', '-llog', '-lOpenSLES', '-Wl,-z,max-page-size=16384', '-Wl,-z,common-page-size=16384']) flags.push('-C', `link-arg=${argument}`);
  for (const [source, destination] of [
    [process.env.CARGO_HOME ?? path.join(homedir(), '.cargo'), '/tauri-native/cargo'],
    [runtime.sourceRoot, '/tauri-native/producer'], [targetDirectory, '/tauri-native/build'], [runtime.directory, '/tauri-native/integration'],
  ]) flags.push(`--remap-path-prefix=${source}=${destination}`);
  return { ...process.env, NODE_OPTIONS: '', CARGO_TARGET_DIR: targetDirectory, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f') };
}

export function assertNativePaths(library: string, runtime: Pick<ReturnType<typeof prepareRuntime>, 'directory' | 'sourceRoot'>, targetDirectory: string) {
  const bytes = readFileSync(library);
  for (const prefix of [runtime.directory, runtime.sourceRoot, targetDirectory, process.env.CARGO_HOME ?? path.join(homedir(), '.cargo')]) {
    if (bytes.includes(Buffer.from(prefix))) throw new Error(`Native library retains an absolute build/source path after remapping: ${path.basename(library)} (${prefix}). Previous artifacts preserved.`);
  }
}
