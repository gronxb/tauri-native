import { readFileSync } from 'node:fs';

export function libraryNameFromManifest(source: string): string {
  const libSection = source.match(/\[lib\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const packageSection = source.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const name =
    libSection?.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ??
    packageSection?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];

  if (!name) {
    throw new Error('Could not find a package or library name');
  }

  return name.replaceAll('-', '_');
}

export function readLibraryName(manifest: string): string {
  try {
    return libraryNameFromManifest(readFileSync(manifest, 'utf8'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Could not find a package or library name'
    ) {
      throw new Error(`${error.message} in ${manifest}`);
    }
    throw error;
  }
}
