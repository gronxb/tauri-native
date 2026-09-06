import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import type { SourceModel } from '../discovery/project.ts';
import { inventory, type ArtifactFile } from './files.ts';
import { generateCommands } from '../types/commands.ts';

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

function relativeFile(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !value.includes(':') && !path.posix.isAbsolute(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

export function validateArtifactManifest(directory: string): ArtifactManifest {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ArtifactManifest;
  if (manifest.formatVersion !== 1 || ![0, 1, 2].includes(manifest.abiVersion) || !['ios', 'android'].includes(manifest.platform)) throw new Error('Unsupported artifact format, ABI or platform');
  if (manifest.generator?.name !== packageJson.name || typeof manifest.generator.version !== 'string') throw new Error('Invalid artifact generator');
  const generated = manifest.abiVersion !== 0;
  if (manifest.compatibility?.mode !== (generated ? 'generated' : 'legacy') || manifest.compatibility.verifiedTauri !== (generated ? '2.11.5' : null) || manifest.compatibility.verifiedApi !== (generated ? '2.11.1' : null)) throw new Error('Incompatible artifact API contract');
  if (!manifest.source || !Object.keys(manifest.source).length || Object.entries(manifest.source).some(([key, value]) => !/^[a-zA-Z]+Sha256$/.test(key) || !/^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid source fingerprints');
  if (manifest.commands !== (generated ? 'commands.json' : null)) throw new Error('Invalid command metadata path');
  if (manifest.bindings != null && (!generated || manifest.bindings !== 'commands.ts')) throw new Error('Invalid command bindings path');
  if (!Array.isArray(manifest.native) || manifest.native.some(slice => !relativeFile(slice.path))) throw new Error('Invalid native slices');
  if (manifest.platform === 'ios') {
    if (manifest.minimumOsVersion !== '13.0' || manifest.assets !== IOS_LAYOUT.assets || manifest.integration !== IOS_LAYOUT.integration) throw new Error('Invalid iOS artifact layout');
    if (manifest.native.length !== 2 || manifest.native.some(slice => !Array.isArray(slice.architectures))) throw new Error('Invalid native slices');
    const slices = [...manifest.native].sort((a, b) => a.variant.localeCompare(b.variant));
    if (slices[0]!.variant !== 'device' || [...slices[0]!.architectures].sort().join(',') !== 'arm64' || slices[1]!.variant !== 'simulator' || [...slices[1]!.architectures].sort().join(',') !== 'arm64,x86_64') throw new Error('Missing required iOS slice');
  } else {
    if (manifest.minimumApiLevel !== 24 || manifest.pageSize !== 16384 || manifest.assets !== 'assets/tauri-native' || manifest.integration !== null || manifest.header !== (generated ? 'include/tauri_native.h' : null)) throw new Error('Invalid Android artifact layout or compatibility');
    if (manifest.native.length !== 4 || ANDROID_ABIS.some(abi => manifest.native.filter(slice => slice.abi === abi && slice.path === `jniLibs/${abi}/libtauri_native_core.so`).length !== 1)) throw new Error('Missing required Android ABI');
  }
  if (!Array.isArray(manifest.files) || manifest.files.some(file => !relativeFile(file.path) || file.path === 'manifest.json' || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0)) throw new Error('Invalid artifact file inventory');
  const expected = new Map(manifest.files.map(file => [file.path, file]));
  if (expected.size !== manifest.files.length) throw new Error('Duplicate artifact file');
  const actual = inventory(directory).filter(file => file.path !== 'manifest.json');
  if (actual.length !== expected.size || actual.some(file => file.sha256 !== expected.get(file.path)?.sha256 || file.size !== expected.get(file.path)?.size)) throw new Error('Artifact integrity check failed');
  for (const file of [ ...(manifest.integration ? [manifest.integration] : []), `${manifest.assets}/index.html`, ...manifest.native.map(slice => slice.path), ...(manifest.commands ? [manifest.commands] : []), ...(manifest.platform === 'android' && manifest.header ? [manifest.header] : [])]) {
    if (!expected.has(file)) throw new Error(`Missing artifact file: ${file}`);
  }
  if (manifest.commands) {
    if (manifest.bindings && !expected.has(manifest.bindings)) throw new Error('Missing command bindings');
    const model = JSON.parse(readFileSync(path.join(directory, manifest.commands), 'utf8')) as SourceModel;
    if (model.schemaVersion !== 1 || model.abiVersion !== manifest.abiVersion || !Array.isArray(model.commands)) throw new Error('Incompatible command model');
  }
  return manifest;
}
