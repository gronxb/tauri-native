import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface ArtifactFile { path: string; sha256: string; size: number }

export function inventory(directory: string, prefix = ''): ArtifactFile[] {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return inventory(directory, relative);
    if (!entry.isFile()) throw new Error(`Artifact must contain regular files, not links: ${relative}`);
    const bytes = readFileSync(path.join(directory, relative));
    return [{ path: relative, sha256: sha256(bytes), size: bytes.length }];
  });
}
