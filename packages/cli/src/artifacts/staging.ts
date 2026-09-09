import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { nativeTool } from '../discovery/native-tool.ts';

const generatedRoots = new Set(['manifest.json', 'commands.json', 'commands.ts', 'TauriNativeCore.xcframework', 'TauriNativeAssets.bundle', 'TauriNativeGenerated.podspec', 'jniLibs', 'assets', 'include']);

function checkDestination(directory: string, roots: ReadonlySet<string>): void {
  if (!existsSync(directory)) return;
  if (!lstatSync(directory).isDirectory() || readdirSync(directory).some(name => !roots.has(name))) {
    throw new Error(`Output must be a dedicated artifact directory without unrelated files: ${directory}`);
  }
}

export function publishArtifacts(directory: string, build: (stage: string) => void, validate: (stage: string) => void, roots: ReadonlySet<string> = generatedRoots): void {
  checkDestination(directory, roots);
  mkdirSync(path.dirname(directory), { recursive: true });
  const lock = `${directory}.lock`;
  try { writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw Object.assign(new Error(`Another export owns ${lock}. If its process has stopped after a forced interruption, remove that lock before retrying.`), { code: 'output_busy' });
  }
  let stage: string | undefined;
  try {
    stage = mkdtempSync(path.join(path.dirname(directory), `.${path.basename(directory)}-stage-`));
    build(stage);
    validate(stage);
    checkDestination(directory, roots);
    // Both directories live on the same volume. A failed/interrupted build never
    // unlinks the last export; replacement is a single atomic filesystem call.
    if (existsSync(directory)) nativeTool('exchange-directories', stage, directory);
    else renameSync(stage, directory);
  } finally {
    try { if (stage) rmSync(stage, { recursive: true, force: true }); }
    finally { rmSync(lock, { force: true }); }
  }
}
