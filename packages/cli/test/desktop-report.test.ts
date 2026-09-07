import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { waitForDesktopReport } from './native-export/desktop-report.ts';

for (const scenario of [
  { name: 'empty', initial: '', report: { passed: true, documentId: 'desktop' } },
  { name: 'partial', initial: '{"passed":', report: { passed: true, documentId: 'desktop' } },
  { name: 'failed', initial: '', report: { passed: false, error: 'event delivery failed' } },
]) {
  test(`waits for a complete ${scenario.name} desktop report`, async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'desktop-report-'));
    const file = path.join(directory, 'report.json');
    const writer = spawn(process.execPath, ['--input-type=module', '-e', `
      import { writeFileSync } from 'node:fs';
      writeFileSync(process.argv[1], process.argv[2]);
      process.once('message', report => {
        writeFileSync(process.argv[1], JSON.stringify(report));
        process.disconnect();
      });
      process.send('opened');
    `, file, scenario.initial], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    try {
      await once(writer, 'message');
      assert.equal(readFileSync(file, 'utf8'), scenario.initial);
      // Start reading while the writer is paused with an incomplete file.
      const report = waitForDesktopReport(file, writer);
      writer.send(scenario.report);
      assert.deepEqual(await report, scenario.report);
    } finally {
      if (writer.exitCode === null && writer.signalCode === null) {
        const closed = once(writer, 'close');
        writer.kill();
        await closed;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('reports malformed JSON when the desktop process has exited', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'desktop-report-'));
  try {
    const file = path.join(directory, 'report.json');
    writeFileSync(file, '{"passed":');
    const desktop = spawn(process.execPath, ['-e', 'process.exit(17)']);
    await once(desktop, 'exit');
    await assert.rejects(waitForDesktopReport(file, desktop), error => {
      assert(error instanceof Error);
      assert.match(error.message, /exit=17/);
      assert(error.cause instanceof SyntaxError);
      return true;
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
