import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runtimeBuildEnvironment } from '../../src/runtime/paths.ts';

test('Rust paths with spaces are remapped while explicit producer compiler flags survive', () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'retained path source ')));
  const source = path.join(directory, 'private producer'); mkdirSync(source);
  const file = path.join(source, 'main.rs'), binary = path.join(directory, 'probe');
  writeFileSync(file, '#[cfg(producer_flag)] fn main() { println!("{}", file!()); }\n');
  const previous = process.env.CARGO_ENCODED_RUSTFLAGS;
  try {
    process.env.CARGO_ENCODED_RUSTFLAGS = '--cfg\x1fproducer_flag';
    const env = runtimeBuildEnvironment({ directory, sourceRoot: source }, path.join(directory, 'target'), 'ios');
    execFileSync('rustc', [file, '-g', '-o', binary, ...env.CARGO_ENCODED_RUSTFLAGS.split('\x1f')]);
    assert.equal(execFileSync(binary, [], { encoding: 'utf8' }).trim(), '/tauri-native/integration/private producer/main.rs');
    // The native linker records object locations outside rustc's path mapping.
    execFileSync('strip', ['-S', binary]);
    assert(!readFileSync(binary).includes(Buffer.from(directory)), 'Neither file!() nor native debug data retains the producer path');
  } finally {
    if (previous === undefined) delete process.env.CARGO_ENCODED_RUSTFLAGS; else process.env.CARGO_ENCODED_RUSTFLAGS = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
