import { writeFileSync } from 'node:fs';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import type { SourceModel } from '../discovery/project.ts';
import { inventory, type ArtifactFile } from './files.ts';
import { generateCommands } from '../types/commands.ts';
import { readArtifacts } from '../../../../scripts/artifacts.ts';

export const ANDROID_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'] as const;
export const IOS_LAYOUT = { platform: 'ios', minimumOsVersion: '13.0', assets: 'TauriNativeAssets.bundle', integration: 'TauriNativeGenerated.podspec' } as const;

export type IosArtifacts = typeof IOS_LAYOUT & {
  native: { path: string; architectures: string[]; variant: 'device' | 'simulator' }[];
};
export interface AndroidArtifacts {
  platform: 'android';
  minimumApiLevel: 24;
  pageSize: 16384;
  native: { path: string; abi: typeof ANDROID_ABIS[number] }[];
  assets: 'assets/tauri-native';
  integration: null;
  header: 'include/tauri_native.h' | null;
}

export type ArtifactManifest = (IosArtifacts | AndroidArtifacts) & {
  formatVersion: 1;
  abiVersion: 0 | 1 | 2;
  generator: { name: string; version: string };
  compatibility: { mode: 'generated' | 'legacy'; verifiedTauri: string | null; verifiedApi: string | null };
  source: Record<string, string>;
  commands: 'commands.json' | null;
  bindings?: 'commands.ts' | null;
  files: ArtifactFile[];
};

export function writeArtifactManifest(directory: string, input: (IosArtifacts | AndroidArtifacts) & { source: Record<string, string> }, model?: SourceModel): void {
  if (model) writeFileSync(path.join(directory, 'commands.json'), JSON.stringify(model, null, 2) + '\n');
  if (model?.typeGraph) writeFileSync(path.join(directory, 'commands.ts'), generateCommands(model));
  const manifest: ArtifactManifest = {
    formatVersion: 1, abiVersion: model ? model.abiVersion : 0,
    generator: { name: packageJson.name, version: packageJson.version },
    compatibility: { mode: model ? 'generated' : 'legacy', verifiedTauri: model ? '2.11.5' : null, verifiedApi: model ? '2.11.1' : null },
    ...input, commands: model ? 'commands.json' : null, bindings: model?.typeGraph ? 'commands.ts' : null,
    files: inventory(directory),
  };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

// The CLI and both host packages use the same portable receipt checks/codes.
export function validateArtifactManifest(directory: string): ArtifactManifest {
  return readArtifacts(directory) as ArtifactManifest;
}
