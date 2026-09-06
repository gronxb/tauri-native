#!/usr/bin/env node

import process from 'node:process';
import { createProgram } from './cli.ts';
import { writeError } from './utils/output.ts';

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  const code = (error as { code?: string })?.code;
  writeError(`${code ? `[${code}] ` : ''}${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
