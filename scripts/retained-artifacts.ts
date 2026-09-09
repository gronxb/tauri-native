import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ArtifactError } from './artifacts.ts';

export const retainedAndroidAbis = { aarch64: 'arm64-v8a', armv7: 'armeabi-v7a', i686: 'x86', x86_64: 'x86_64' } as const;
interface RetainedArtifactBase {
  formatVersion: 2;
  abiVersion: 3;
  generator: { name: '@tauri-native/cli'; version: string };
  compatibility: { mode: 'retained'; tauri: '2.11.5'; tauriCli: '2.11.4'; wry: '0.55.1'; tauriRuntimeWry: '2.11.4' };
  profile: 'debug' | 'release';
  plugins: Record<string, string>;
  commands: 'commands.json';
  callers: 'callers.json';
  source: Record<string, string>;
  files: { path: string; sha256: string; size: number }[];
}
export interface RetainedAndroidArtifact extends RetainedArtifactBase {
  platform: 'android';
  bootstrap: { owner: 'tauri'; project: 'android'; applicationId: string; activity: string; minimumApiLevel: 24 };
  native: { abi: typeof retainedAndroidAbis[keyof typeof retainedAndroidAbis]; path: string }[];
}
export interface RetainedIosArtifact extends RetainedArtifactBase {
  platform: 'ios';
  bootstrap: { owner: 'tauri'; project: 'ios'; xcodeProject: string; target: string; applicationId: string; minimumOsVersion: string };
  native: { path: string; variant: 'device' | 'simulator'; architectures: ('arm64' | 'x86_64')[] }[];
}
export type RetainedArtifact = RetainedAndroidArtifact | RetainedIosArtifact;

/** Source-free consumer validation. Format 1 hosts deliberately reject this format. */
export function readRetainedArtifacts(directory: string): RetainedArtifact {
  const fail = (code: string, message: string): never => { throw new ArtifactError(code, `Invalid retained artifact: ${message}`); };
  try {
    if (!lstatSync(directory).isDirectory() || !lstatSync(path.join(directory, 'manifest.json')).isFile()) fail('artifact_symlink', 'root and manifest must be regular paths');
    const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8')) as RetainedArtifact;
    if (manifest?.formatVersion !== 2 || manifest.abiVersion !== 3) fail('artifact_format', 'requires format 2 / retained ABI 3');
    if (!['android', 'ios'].includes(manifest.platform)) fail('artifact_platform', 'unsupported retained platform');
    if (manifest.compatibility?.mode !== 'retained' || manifest.compatibility.tauri !== '2.11.5' || manifest.compatibility.tauriCli !== '2.11.4' ||
        manifest.compatibility.wry !== '0.55.1' || manifest.compatibility.tauriRuntimeWry !== '2.11.4') fail('artifact_api', 'unverified Tauri/Wry runtime version');
    if (manifest.generator?.name !== '@tauri-native/cli' || typeof manifest.generator.version !== 'string' || !['debug', 'release'].includes(manifest.profile)) fail('artifact_metadata', 'invalid generator or build profile');
    if (manifest.bootstrap?.owner !== 'tauri' || manifest.bootstrap.project !== manifest.platform) fail('artifact_bootstrap', 'requires the original Tauri bootstrap');
    if (manifest.platform === 'android' && (manifest.bootstrap.minimumApiLevel !== 24 ||
        !/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(manifest.bootstrap.applicationId) || manifest.bootstrap.activity !== `${manifest.bootstrap.applicationId}.MainActivity`)) fail('artifact_bootstrap', 'requires the exported Tauri Activity and one Tauri bootstrap');
    if (manifest.platform === 'ios' && (!/^[\w.-]+\.xcodeproj$/.test(manifest.bootstrap.xcodeProject) || !/^[\w.-]+$/.test(manifest.bootstrap.target) ||
        !/^[\w-]+(?:\.[\w-]+)+$/.test(manifest.bootstrap.applicationId) || !/^\d+\.\d+(?:\.\d+)?$/.test(manifest.bootstrap.minimumOsVersion))) fail('artifact_bootstrap', 'invalid retained iOS bootstrap');
    if (manifest.commands !== 'commands.json' || manifest.callers !== 'callers.json' || !manifest.source || !Object.keys(manifest.source).length ||
        Object.values(manifest.source).some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) fail('artifact_metadata', 'invalid command, policy or input fingerprints');
    if (!manifest.plugins || Object.entries(manifest.plugins).some(([name, version]) => !['tauri-plugin-geolocation@2.3.3', 'tauri-plugin-deep-link@2.4.10'].includes(`${name}@${version}`))) fail('artifact_plugin', 'native plugin needs compatibility evidence');
    if (!Array.isArray(manifest.native) || !manifest.native.length) fail('artifact_slice', 'missing native slices');
    if (manifest.platform === 'android' && (new Set(manifest.native.map(slice => slice.abi)).size !== manifest.native.length ||
        manifest.native.some(slice => !Object.values(retainedAndroidAbis).includes(slice.abi) || !new RegExp(`^android/app/src/main/jniLibs/${slice.abi}/lib[a-zA-Z0-9_]+\\.so$`).test(slice.path)))) fail('artifact_slice', 'invalid Android native slices');
    if (manifest.platform === 'ios' && (new Set(manifest.native.map(slice => slice.variant)).size !== manifest.native.length ||
        manifest.native.some(slice => !['device', 'simulator'].includes(slice.variant) || !/^ios\/TauriNativeRuntime\.xcframework\/[\w-]+\/libapp\.a$/.test(slice.path) ||
          !Array.isArray(slice.architectures) || !slice.architectures.length || new Set(slice.architectures).size !== slice.architectures.length ||
          slice.architectures.some(arch => !['arm64', ...(slice.variant === 'simulator' ? ['x86_64'] : [])].includes(arch))))) fail('artifact_slice', 'invalid iOS native slices');
    if (!Array.isArray(manifest.files)) fail('artifact_inventory', 'missing file inventory');
    const files = new Map<string, RetainedArtifactBase['files'][number]>();
    for (const file of manifest.files) {
      if (!file || typeof file.path !== 'string' || !file.path || /[\\:\0]/.test(file.path) || file.path.split('/').some(part => !part || part === '.' || part === '..') ||
          file.path === 'manifest.json' || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) fail('artifact_inventory', 'invalid or duplicate file receipt');
      files.set(file.path, file);
    }
    let count = 0;
    function visit(prefix = '') {
      for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
        const relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) visit(relative);
        else {
          if (!entry.isFile()) fail('artifact_symlink', `not portable: ${relative}`);
          if (relative === 'manifest.json') continue;
          const bytes = readFileSync(path.join(directory, relative)), receipt = files.get(relative);
          if (!receipt || receipt.size !== bytes.length || receipt.sha256 !== createHash('sha256').update(bytes).digest('hex')) fail('artifact_checksum', `changed or unexpected file: ${relative}`);
          count++;
        }
      }
    }
    visit();
    const required = ['commands.json', 'callers.json', 'include/tauri_native_runtime.h', ...manifest.native.map(slice => slice.path)];
    if (manifest.platform === 'android') required.push('android/settings.gradle', 'android/tauri.settings.gradle',
      'android/gradlew', 'android/app/build.gradle.kts', 'android/app/src/main/AndroidManifest.xml',
      'android/app/src/main/java/dev/taurinative/runtime/RuntimeSession.java');
    else required.push(`ios/${manifest.bootstrap.xcodeProject}/project.pbxproj`, 'ios/TauriNativeRuntime.xcframework/Info.plist',
      'ios/Sources/TauriNativeRuntime/TNRuntimeSession.h', 'ios/Sources/TauriNativeRuntime/TNRuntimeSession.mm', 'ios/Sources/TauriNativeRuntime/tauri_native_runtime.h');
    if (count !== files.size || required.some(file => !files.has(file))) fail('artifact_missing_file', 'missing native bootstrap, resources or contract');
    const commands = JSON.parse(readFileSync(path.join(directory, manifest.commands), 'utf8'));
    if (commands?.schemaVersion !== 1 || commands.abiVersion !== 3 || !Array.isArray(commands.commands)) fail('artifact_abi', 'incompatible command metadata');
    const policy = JSON.parse(readFileSync(path.join(directory, manifest.callers), 'utf8'));
    if (policy?.version !== 1 || !policy.callers || !Object.keys(policy.callers).length) fail('artifact_policy', 'missing explicit native caller delegation');
    if (createHash('sha256').update(readFileSync(path.join(directory, 'callers.json'))).digest('hex') !== manifest.source.callerPolicySha256) fail('artifact_policy', 'caller policy differs from compiled policy receipt');
    return manifest;
  } catch (error) {
    if (error instanceof ArtifactError) throw error;
    throw new ArtifactError('artifact_read', `Cannot read retained artifacts: ${error instanceof Error ? error.message : error}`);
  }
}
