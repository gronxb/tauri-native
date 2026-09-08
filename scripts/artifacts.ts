import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface ArtifactReceipt {
  formatVersion: 1;
  abiVersion: 0 | 1 | 2;
  platform: 'ios' | 'android';
  assets: string;
  bindings?: 'commands.ts' | null;
  files: { path: string; sha256: string; size: number }[];
}
interface Manifest extends ArtifactReceipt {
  generator: { name: string; version: string };
  source: Record<string, string>;
  compatibility: { mode: string; verifiedTauri: string | null; verifiedApi: string | null };
  commands: string | null;
  native: { path: string; variant?: string; architectures?: string[]; abi?: string }[];
  minimumOsVersion?: string;
  minimumApiLevel?: number;
  pageSize?: number;
  integration: string | null;
  header?: string | null;
}

export class ArtifactError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = 'ArtifactError'; this.code = code; }
}

// This Node-only reader ships in the host package. It needs neither the CLI nor
// its Rust/NDK/Xcode validation tools; binaries were validated during export.
export function readArtifacts(directory: string, platform?: ArtifactReceipt['platform']): ArtifactReceipt {
  try { return validate(directory, platform); }
  catch (error) {
    if (error instanceof ArtifactError) throw error;
    const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'artifact_missing' : error instanceof SyntaxError ? 'artifact_json' : 'artifact_read';
    throw new ArtifactError(code, `Could not read artifacts at "${directory}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validate(directory: string, platform?: ArtifactReceipt['platform']): ArtifactReceipt {
  const invalid = (code: string, message: string): never => { throw new ArtifactError(code, `Invalid ${platform ?? ''} artifacts at "${directory}": ${message}`); };
  if (!lstatSync(directory).isDirectory() || !lstatSync(path.join(directory, 'manifest.json')).isFile()) invalid('artifact_symlink', 'the artifact root and manifest must not be links');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as Manifest;
  if (!manifest || manifest.formatVersion !== 1) invalid('artifact_format', 'unsupported format');
  platform ??= manifest.platform;
  if ((platform !== 'ios' && platform !== 'android') || manifest.platform !== platform) invalid('artifact_platform', 'unsupported platform');
  if (![0, 1, 2].includes(manifest.abiVersion)) invalid('artifact_abi', 'unsupported ABI');
  if (manifest.generator?.name !== '@tauri-native/cli' || typeof manifest.generator.version !== 'string') invalid('artifact_metadata', 'invalid artifact generator');
  if (!manifest.source || !Object.keys(manifest.source).length || Object.entries(manifest.source).some(([key, value]) => !/^[a-zA-Z]+Sha256$/.test(key) || !/^[a-f0-9]{64}$/.test(value))) invalid('artifact_metadata', 'invalid source fingerprints');
  const generated = manifest.abiVersion !== 0;
  if (manifest.compatibility?.mode !== (generated ? 'generated' : 'legacy') || manifest.compatibility?.verifiedTauri !== (generated ? '2.11.5' : null) || manifest.compatibility?.verifiedApi !== (generated ? '2.11.1' : null)) invalid('artifact_api', 'unsupported API compatibility');
  if (manifest.commands !== (generated ? 'commands.json' : null)) invalid('artifact_metadata', 'invalid command metadata');
  if (manifest.bindings != null && (!generated || manifest.bindings !== 'commands.ts')) invalid('artifact_metadata', 'invalid command bindings');
  const assets = platform === 'ios' ? 'TauriNativeAssets.bundle' : 'assets/tauri-native';
  if (manifest.assets !== assets || !Array.isArray(manifest.native) || manifest.native.some(slice => !slice || typeof slice.path !== 'string')) invalid('artifact_layout', 'invalid native/assets layout');
  const required = [`${assets}/index.html`, ...(generated ? ['commands.json'] : [])];
  if (manifest.bindings) required.push(manifest.bindings);
  const headers = [];
  if (platform === 'ios') {
    if (manifest.minimumOsVersion !== '13.0') invalid('artifact_api', 'invalid iOS minimum OS version');
    if (manifest.integration !== 'TauriNativeGenerated.podspec' || manifest.native.length !== 2) invalid('artifact_layout', 'invalid iOS layout');
    for (const [variant, architectures] of [['device', 'arm64'], ['simulator', 'arm64,x86_64']]) {
      const slices = manifest.native.filter(slice => slice.variant === variant);
      if (slices.length !== 1 || !Array.isArray(slices[0]!.architectures) || [...slices[0]!.architectures].sort().join(',') !== architectures || typeof slices[0]!.path !== 'string' || !slices[0]!.path.startsWith('TauriNativeCore.xcframework/')) invalid('artifact_slice', `missing ${variant} architectures`);
      headers.push(path.posix.join(path.posix.dirname(slices[0]!.path), 'Headers/tauri_native.h'));
    }
    required.push('TauriNativeCore.xcframework/Info.plist', 'TauriNativeGenerated.podspec', ...headers);
  } else if (platform === 'android') {
    if (manifest.minimumApiLevel !== 24) invalid('artifact_api', 'invalid Android API level');
    if (manifest.pageSize !== 16384) invalid('artifact_alignment', 'invalid Android page alignment');
    if (manifest.integration !== null || manifest.header !== (generated ? 'include/tauri_native.h' : null) || manifest.native.length !== 4) invalid('artifact_layout', 'invalid Android layout');
    for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']) {
      if (manifest.native.filter(slice => slice.abi === abi && slice.path === `jniLibs/${abi}/libtauri_native_core.so`).length !== 1) invalid('artifact_slice', `missing ${abi}`);
    }
    if (generated) { headers.push('include/tauri_native.h'); required.push(...headers); }
  }
  required.push(...manifest.native.map(slice => slice.path));
  if (!Array.isArray(manifest.files)) invalid('artifact_inventory', 'missing file inventory');
  const files = new Map<string, ArtifactReceipt['files'][number]>();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || !file.path || file.path.includes('\\') || file.path.includes(':') || file.path.includes('\0') || file.path.split('/').some(part => !part || part === '.' || part === '..') || file.path === 'manifest.json' || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) invalid('artifact_inventory', 'invalid or duplicate file path/checksum');
    files.set(file.path, file);
  }
  let count = 0;
  function visit(prefix = '') {
    for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(relative);
      else {
        if (!entry.isFile()) invalid('artifact_symlink', `links are not portable: ${relative}`);
        if (relative === 'manifest.json') continue;
        const file = files.get(relative); const bytes = readFileSync(path.join(directory, relative));
        if (!file || file.size !== bytes.length || file.sha256 !== createHash('sha256').update(bytes).digest('hex')) invalid('artifact_checksum', `checksum mismatch or unexpected file: ${relative}`);
        count++;
      }
    }
  }
  visit();
  if (count !== files.size || required.some(file => !files.has(file))) invalid('artifact_missing_file', 'missing required file');
  if (generated) {
    const model = JSON.parse(readFileSync(path.join(directory, manifest.commands!), 'utf8'));
    if (!model || model.schemaVersion !== 1 || model.abiVersion !== manifest.abiVersion || !Array.isArray(model.commands)) invalid('artifact_metadata', 'incompatible command metadata');
    for (const header of headers) if (!new RegExp(`^#define TAURI_NATIVE_ABI_VERSION ${manifest.abiVersion}\\b`, 'm').test(readFileSync(path.join(directory, header), 'utf8'))) invalid('artifact_abi', 'incompatible ABI header');
  }
  return manifest;
}
