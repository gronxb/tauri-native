import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));

describe('tauri-native CLI', () => {
  it('exposes the iOS export command from the bundled entry point', () => {
    const result = spawnSync(process.execPath, [cli, 'export', 'ios', '--help'], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /Usage: tauri-native export ios \[options\]/);
    assert.match(result.stdout, /--tauri-dir <path>/);
    assert.match(result.stdout, /--output-dir <path>/);
  });

  it('returns a failing exit code when the Tauri project is missing', () => {
    const result = spawnSync(
      process.execPath,
      [cli, 'export', 'ios', '--tauri-dir', 'missing-project'],
      { encoding: 'utf8' }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Required file does not exist:/);
    assert.match(result.stderr, /missing-project/);
  });
});
