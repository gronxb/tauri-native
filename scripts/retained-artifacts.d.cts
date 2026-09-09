export const retainedAndroidAbis: { readonly aarch64: 'arm64-v8a'; readonly armv7: 'armeabi-v7a'; readonly i686: 'x86'; readonly x86_64: 'x86_64' };
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

/** Validate the complete copied artifact using Node.js, without Rust or producer sources. */
export function readRetainedArtifacts(directory: string): RetainedArtifact;
