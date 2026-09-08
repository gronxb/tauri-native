import type { ArtifactReceipt } from './artifacts.ts';

export type Platform = 'ios' | 'android';
export interface PackageManifest {
  name: string;
  version: string;
  private?: boolean;
  publishConfig?: { registry?: string; tag?: string; access?: string };
  dependencies: Record<string, string>;
  main?: string;
  types?: string;
  bin?: Record<string, string>;
  exports?: unknown;
  license?: string;
  files?: string[];
}
export interface PackedPackage {
  sdk: string;
  name: string;
  version: string;
  file: string;
  sha256: string;
}
export interface ProducerReceipt {
  schemaVersion: number;
  commit: string;
  passed: boolean;
  packages: PackedPackage[];
  exportsSha256: string;
  androidPreparation: { apkSha256: string };
}
export interface FeatureReceipt {
  changedRust: boolean;
  passed: boolean;
  results: {
    host: string;
    platform: string;
    passed: boolean;
    packageSha256: string;
    abandonment: { elapsedMs: number; injectedSearchDelayMs: number }[];
  }[];
}
export interface StandaloneReceipt {
  transferredApkSha256: string;
  emulator: { pageSize: number };
}
export interface NativeReceipt {
  schemaVersion: number;
  platform: string;
  commit: string;
  producerReceiptSha256: string;
  passed: boolean;
  packages: PackedPackage[];
  checks: string[];
  features: FeatureReceipt[];
  lynxAndroidMinified: boolean;
  lynxR8MappingSha256: string;
  standalone: StandaloneReceipt;
}
export interface CandidateReceipt {
  schemaVersion: number;
  commit: string;
  passed: boolean;
  checks: Record<string, string>;
  packages: PackedPackage[];
}
export interface HostSettings {
  RN_HOST: string;
  LYNX_HOST: string;
  EXPO_HOST: string;
  FIELDNOTES_PACKAGES: string;
  NATIVE_HOST_PATH: string;
}
export interface FeatureExport {
  changedRust: boolean;
  producerDeleted: boolean;
  producerUnchanged: boolean;
  desktopFrontend: { passed: boolean }[];
  artifacts: Record<Platform, { files: ArtifactReceipt['files']; bytes: number }>;
  sourceHashes: Record<string, string>;
}
export interface MaestroCommand {
  metadata: { sequenceNumber: number; status: string; timestamp: number; duration: number };
  command: {
    launchAppCommand?: { clearState?: boolean };
    assertConditionCommand?: { condition?: { visible?: { textRegex?: string } } };
    tapOnElement?: { selector?: { textRegex?: string } };
  };
}
