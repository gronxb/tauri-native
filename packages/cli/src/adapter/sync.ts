import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Synchronize only the disposable adapter cache, retaining unchanged files' mtimes for Cargo. */
export function syncAdapter(source: string, destination: string): void {
  const info = lstatSync(source);
  let previous;
  try { previous = lstatSync(destination); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (info.isSymbolicLink()) {
    const link = readlinkSync(source);
    if (previous?.isSymbolicLink() && readlinkSync(destination) === link) return;
    rmSync(destination, { recursive: true, force: true }); symlinkSync(link, destination, 'dir');
  } else if (info.isDirectory()) {
    if (previous && !previous.isDirectory()) rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    const names = readdirSync(source);
    for (const name of readdirSync(destination)) if (!names.includes(name)) rmSync(path.join(destination, name), { recursive: true, force: true });
    for (const name of names) syncAdapter(path.join(source, name), path.join(destination, name));
  } else {
    const bytes = readFileSync(source);
    if (!previous?.isFile() || !bytes.equals(readFileSync(destination))) {
      if (previous && !previous.isFile()) rmSync(destination, { recursive: true, force: true });
      writeFileSync(destination, bytes, { mode: info.mode });
    }
    if (!previous || (previous.mode & 0o777) !== (info.mode & 0o777)) chmodSync(destination, info.mode & 0o777);
  }
}
