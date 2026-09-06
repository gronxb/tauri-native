import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { nativeTool } from '../discovery/native-tool.ts';

const generatedRoots = new Set(['manifest.json', 'commands.json', 'TauriNativeCore.xcframework', 'TauriNativeAssets.bundle', 'TauriNativeGenerated.podspec', 'jniLibs', 'assets', 'include']);

function checkDestination(directory: string): void {
  if (!existsSync(directory)) return;
  if (!lstatSync(directory).isDirectory() || readdirSync(directory).some(name => !generatedRoots.has(name))) {
    throw new Error(`Output must be a dedicated artifact directory without unrelated files: ${directory}`);
  }
}

export function publishArtifacts(directory: string, build: (stage: string) => void, validate: (stage: string) => void): void {
  checkDestination(directory);
  mkdirSync(path.dirname(directory), { recursive: true });
  const stage = mkdtempSync(path.join(path.dirname(directory), `.${path.basename(directory)}-stage-`));
  try {
    build(stage);
    validate(stage);
    checkDestination(directory);
    // Both directories live on the same volume. A failed/interrupted build never
    // unlinks the last export; replacement is a single atomic filesystem call.
    if (existsSync(directory)) nativeTool('exchange-directories', stage, directory);
    else renameSync(stage, directory);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
