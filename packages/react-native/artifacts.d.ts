export interface ArtifactReceipt {
  formatVersion: 1;
  abiVersion: 0 | 1 | 2;
  platform: 'ios' | 'android';
  assets: string;
  bindings?: 'commands.ts' | null;
  files: { path: string; sha256: string; size: number }[];
}

export class ArtifactError extends Error {
  code: string;
  constructor(code: string, message: string);
}

/** Validate a copied export using only Node.js; throws before integration on mismatch. */
export function readArtifacts(directory: string, platform?: 'ios' | 'android'): ArtifactReceipt;
