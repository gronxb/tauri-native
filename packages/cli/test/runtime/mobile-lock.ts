import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Tauri CLI shares app-identity options across platforms, and Maestro uses a
// shared local driver port. Keep the complete mobile gates serial, including UI.
export function acquireMobileTest(root: string) {
  const directory = path.join(root, 'target');
  mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'tauri-mobile-test.lock');
  try { writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(`Another mobile gate owns ${lock}. Run mobile gates serially. Remove a stale lock only after its recorded process has stopped.`);
  }
  let released = false;
  function release() {
    if (released) return;
    released = true;
    rmSync(lock, { force: true });
    process.removeListener('exit', release);
  }
  process.once('exit', release);
  return release;
}
