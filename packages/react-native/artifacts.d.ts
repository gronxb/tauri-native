export interface ArtifactReceipt {
  formatVersion: 1;
  abiVersion: 0 | 1;
  platform: 'ios' | 'android';
  assets: string;
  files: { path: string; sha256: string; size: number }[];
}

/** Validate a copied export using only Node.js; throws before integration on mismatch. */
export function readArtifacts(directory: string, platform: 'ios' | 'android'): ArtifactReceipt;
