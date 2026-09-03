import { existsSync } from 'node:fs';

export function requireFile(file: string): void {
  if (!existsSync(file)) {
    throw new Error(`Required file does not exist: ${file}`);
  }
}
