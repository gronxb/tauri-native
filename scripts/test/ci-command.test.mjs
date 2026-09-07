import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { output, run } from '../ci/common.mjs';

test('live CI logs preserve literal arguments and do not hide command failures', () => {
  const label = `logging-scenario-${process.pid}`;
  const log = path.join(output, 'logs', `${label}.log`);
  try {
    const literal = 'a path with spaces/$(exit 99) ${HOME} "quoted"';
    assert.equal(run(label, process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]), literal);
    assert.throws(() => run(label, process.execPath, ['-e',
      'console.log("progress before failure"); console.error("command failed"); process.exit(17);']),
    error => error.actual === 17 && error.expected === 0);
    assert.equal(readFileSync(log, 'utf8'), 'progress before failure\ncommand failed\n');
  } finally { rmSync(log, { force: true }); }
});
