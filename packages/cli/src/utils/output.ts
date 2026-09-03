import process from 'node:process';
import { wrapTextWithPrefix } from '@clack/core';

export function message(text: string, startPrefix = '◇ '): void {
  process.stdout.write(
    `${wrapTextWithPrefix(process.stdout, text, '│ ', startPrefix, '│ ')}\n`
  );
}

export function writeError(text: string): void {
  process.stderr.write(
    `${wrapTextWithPrefix(process.stderr, text, '│ ', '■ ', '│ ')}\n`
  );
}
