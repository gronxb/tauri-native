#!/usr/bin/env node

import process from 'node:process';
import { createProgram } from './cli';
import { writeError } from './utils/output';

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
