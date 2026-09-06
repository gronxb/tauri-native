import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Exact generated roots for these fixtures. A directory named src/gen or
// src/target is still authored source and must never disappear from the gate.
const generated = new Set(['node_modules', 'dist', 'src-tauri/target', 'src-tauri/gen', '.git']);

export function snapshot(root, prefix = '') {
  const files = {};
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (generated.has(relative)) continue;
    if (entry.isDirectory()) Object.assign(files, snapshot(root, relative));
    else files[relative] = createHash('sha256').update(readFileSync(path.join(root, relative))).digest('hex');
  }
  return files;
}
