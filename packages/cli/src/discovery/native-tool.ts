import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Diagnostic {
  file: string;
  line?: number;
  column?: number;
  message: string;
}

export class DiscoveryError extends Error {
  readonly diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map(d => `${d.file}:${d.line ?? 1}:${d.column ?? 1}: ${d.message}`).join('\n'));
    this.diagnostics = diagnostics;
  }
}

// Works from the bundled CLI and from source tests. The tarball owns these
// parser sources; no parser or bridge dependency is added to the producer.
const bundled = fileURLToPath(new URL('../native', import.meta.url));
export const nativeDirectory = existsSync(path.join(bundled, 'Cargo.toml'))
  ? bundled : fileURLToPath(new URL('../../native', import.meta.url));

export function commandOutput(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

export function nativeTool<T>(operation: string, input: string, output?: string): T {
  const hash = createHash('sha256');
  for (const file of ['Cargo.toml', 'Cargo.lock', ...readdirSync(path.join(nativeDirectory, 'src')).sort().map(name => `src/${name}`)]) {
    hash.update(file).update(readFileSync(path.join(nativeDirectory, file)));
  }
  const host = commandOutput('rustc', ['-vV']).match(/^host: (.+)$/m)?.[1];
  if (!host) throw new Error('rustc did not report its host target');
  const target = path.join(tmpdir(), 'tauri-native-adapter', hash.digest('hex'));
  const binary = path.join(target, host, 'debug', `tauri-native-adapter${process.platform === 'win32' ? '.exe' : ''}`);
  if (!existsSync(binary)) {
    commandOutput('cargo', ['build', '--locked', '--manifest-path', path.join(nativeDirectory, 'Cargo.toml'), '--target', host, '--target-dir', target], tmpdir());
  }
  const result = spawnSync(binary, [operation, input, ...(output ? [output] : [])], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  const value = JSON.parse(result.stdout) as T & { diagnostics?: Diagnostic[] };
  if (result.status !== 0) throw new DiscoveryError(value.diagnostics ?? [{ file: input, message: result.stderr }]);
  return value;
}
