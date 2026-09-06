import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import packageJson from '../../package.json' with { type: 'json' };
import type { SourceModel } from '../discovery/project.ts';
import { inventory, type ArtifactFile } from './files.ts';

export interface ArtifactManifest {
  formatVersion: 1;
  abiVersion: 0 | 1;
  generator: { name: string; version: string };
  platform: 'ios';
  minimumOsVersion: '13.0';
  compatibility: { mode: 'generated' | 'legacy'; verifiedTauri: string | null; verifiedApi: string | null };
  source: Record<string, string>;
  commands: 'commands.json' | null;
  native: { path: string; architectures: string[]; variant: 'device' | 'simulator' }[];
  assets: 'TauriNativeAssets.bundle';
  integration: 'TauriNativeGenerated.podspec';
  files: ArtifactFile[];
}

export function writeArtifactManifest(directory: string, input: Pick<ArtifactManifest, 'native' | 'source'>, model?: SourceModel): void {
  if (model) writeFileSync(path.join(directory, 'commands.json'), JSON.stringify(model, null, 2) + '\n');
  const manifest: ArtifactManifest = {
    formatVersion: 1, abiVersion: model ? 1 : 0,
    generator: { name: packageJson.name, version: packageJson.version },
    platform: 'ios', minimumOsVersion: '13.0',
    compatibility: { mode: model ? 'generated' : 'legacy', verifiedTauri: model ? '2.11.5' : null, verifiedApi: model ? '2.11.1' : null },
    ...input, commands: model ? 'commands.json' : null,
    assets: 'TauriNativeAssets.bundle', integration: 'TauriNativeGenerated.podspec',
    files: inventory(directory),
  };
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function relativeFile(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !value.includes(':') && !path.posix.isAbsolute(value) && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

export function validateArtifactManifest(directory: string): ArtifactManifest {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as ArtifactManifest;
  if (manifest.formatVersion !== 1 || ![0, 1].includes(manifest.abiVersion) || manifest.platform !== 'ios') throw new Error('Unsupported artifact format, ABI or platform');
  if (manifest.generator?.name !== packageJson.name || typeof manifest.generator.version !== 'string' || manifest.minimumOsVersion !== '13.0') throw new Error('Invalid artifact generator or deployment target');
  const generated = manifest.abiVersion === 1;
  if (manifest.compatibility?.mode !== (generated ? 'generated' : 'legacy') || manifest.compatibility.verifiedTauri !== (generated ? '2.11.5' : null) || manifest.compatibility.verifiedApi !== (generated ? '2.11.1' : null)) throw new Error('Incompatible artifact API contract');
  if (!manifest.source || !Object.keys(manifest.source).length || Object.entries(manifest.source).some(([key, value]) => !/^[a-zA-Z]+Sha256$/.test(key) || !/^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid source fingerprints');
  if (manifest.commands !== (generated ? 'commands.json' : null) || manifest.assets !== 'TauriNativeAssets.bundle' || manifest.integration !== 'TauriNativeGenerated.podspec') throw new Error('Invalid artifact metadata paths');
  if (!Array.isArray(manifest.native) || manifest.native.length !== 2 || manifest.native.some(slice => !relativeFile(slice.path) || !Array.isArray(slice.architectures))) throw new Error('Invalid native slices');
  const slices = [...manifest.native].sort((a, b) => a.variant.localeCompare(b.variant));
  if (slices[0]!.variant !== 'device' || [...slices[0]!.architectures].sort().join(',') !== 'arm64' || slices[1]!.variant !== 'simulator' || [...slices[1]!.architectures].sort().join(',') !== 'arm64,x86_64') throw new Error('Missing required iOS slice');
  if (!Array.isArray(manifest.files) || manifest.files.some(file => !relativeFile(file.path) || file.path === 'manifest.json' || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0)) throw new Error('Invalid artifact file inventory');
  const expected = new Map(manifest.files.map(file => [file.path, file]));
  if (expected.size !== manifest.files.length) throw new Error('Duplicate artifact file');
  const actual = inventory(directory).filter(file => file.path !== 'manifest.json');
  if (actual.length !== expected.size || actual.some(file => file.sha256 !== expected.get(file.path)?.sha256 || file.size !== expected.get(file.path)?.size)) throw new Error('Artifact integrity check failed');
  for (const file of [manifest.integration, `${manifest.assets}/index.html`, ...manifest.native.map(slice => slice.path), ...(manifest.commands ? [manifest.commands] : [])]) {
    if (!expected.has(file)) throw new Error(`Missing artifact file: ${file}`);
  }
  if (manifest.commands) {
    const model = JSON.parse(readFileSync(path.join(directory, manifest.commands), 'utf8')) as SourceModel;
    if (model.schemaVersion !== 1 || model.abiVersion !== 1 || !Array.isArray(model.commands)) throw new Error('Incompatible command model');
  }
  return manifest;
}
