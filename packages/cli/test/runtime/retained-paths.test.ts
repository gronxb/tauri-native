import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runtimeBuildEnvironment } from '../../src/runtime/paths.ts';

for (const configuration of ['Cargo configuration', 'encoded environment', 'RUSTFLAGS environment'] as const) test(`Rust paths with spaces are remapped while ${configuration} compiler flags survive`, () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'retained path source ')));
  const source = path.join(directory, 'private producer');
  mkdirSync(path.join(source, 'src'), { recursive: true }); mkdirSync(path.join(source, '.cargo'));
  writeFileSync(path.join(source, 'Cargo.toml'), '[package]\nname="path-probe"\nversion="0.1.0"\nedition="2021"\n');
  writeFileSync(path.join(source, 'src/main.rs'), 'include!(concat!(env!("CARGO_MANIFEST_DIR"), "/included.rs"));\n');
  writeFileSync(path.join(source, 'included.rs'), '#[cfg(all(producer_flag, producer_wrapper))] fn main() { println!("{}", file!()); }\n');
  writeFileSync(path.join(source, '.cargo/config.toml'), '[build]\nrustflags=["--cfg", "producer_flag"]\n');
  const outer = path.join(directory, 'producer-wrapper.cjs');
  writeFileSync(outer, '#!/usr/bin/env node\nconst { spawnSync } = require("node:child_process"); const args = process.argv.slice(2); const command = args.shift(); if (args.includes("--crate-name")) args.push("--cfg", "producer_wrapper"); process.exit(spawnSync(command, args, { stdio: "inherit" }).status ?? 1);\n', { mode: 0o755 });
  const previous = { encoded: process.env.CARGO_ENCODED_RUSTFLAGS, flags: process.env.RUSTFLAGS, wrapper: process.env.RUSTC_WRAPPER };
  try {
    delete process.env.RUSTFLAGS; delete process.env.CARGO_ENCODED_RUSTFLAGS;
    process.env.RUSTC_WRAPPER = outer;
    if (configuration === 'encoded environment') process.env.CARGO_ENCODED_RUSTFLAGS = '--cfg\x1fproducer_flag';
    if (configuration === 'RUSTFLAGS environment') process.env.RUSTFLAGS = '--cfg producer_flag';
    const { env } = runtimeBuildEnvironment({ directory, sourceRoot: source }, path.join(directory, 'target'), 'ios');
    const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)![1]!;
    execFileSync('cargo', ['build', '--offline', '--target', host], { cwd: source, env, stdio: 'pipe' });
    const binary = path.join(env.CARGO_TARGET_DIR, host, 'debug/path-probe');
    assert.equal(execFileSync(binary, [], { encoding: 'utf8' }).trim(), '/tauri-native/integration/private producer/included.rs');
    execFileSync('strip', ['-S', binary]);
    assert(!readFileSync(binary).includes(Buffer.from(directory)), 'Neither file!() nor native debug data retains the producer path');
  } finally {
    for (const [key, value] of [['CARGO_ENCODED_RUSTFLAGS', previous.encoded], ['RUSTFLAGS', previous.flags], ['RUSTC_WRAPPER', previous.wrapper]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
