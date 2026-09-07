import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

export async function waitForDesktopReport(file: string, desktop: ChildProcess): Promise<unknown> {
  const deadline = Date.now() + 60000;
  for (;;) {
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) {
      // The writer can create/truncate the file before its JSON is complete.
      if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (desktop.exitCode !== null || desktop.signalCode !== null || Date.now() >= deadline) {
        throw new Error(`Desktop did not complete JSON report at ${file}; exit=${desktop.exitCode}; signal=${desktop.signalCode}`, { cause: error });
      }
    }
    await setTimeout(200);
  }
}
