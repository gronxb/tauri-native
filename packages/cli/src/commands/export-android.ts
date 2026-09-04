import { execSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readLibraryName } from '../utils/cargo-manifest.ts';
import { requireFile } from '../utils/files.ts';
import { message } from '../utils/output.ts';
import { run } from '../utils/process.ts';

export interface ExportAndroidOptions {
  tauriDir: string;
  manifest?: string;
  outputDir?: string;
}

interface TauriConfig {
  build?: {
    beforeBuildCommand?: unknown;
    frontendDist?: unknown;
  };
}

export const ANDROID_ABIS = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86',
  'x86_64',
] as const;

const ANDROID_TARGETS = [
  'aarch64-linux-android',
  'armv7-linux-androideabi',
  'i686-linux-android',
  'x86_64-linux-android',
];

const ANDROID_API_LEVEL = '24';
const OUTPUT_LIBRARY_NAME = 'libtauri_native_core.so';

export function copyAndroidLibraries(
  cargoOutput: string,
  outputDirectory: string,
  libraryName: string
): void {
  const jniLibraries = path.join(outputDirectory, 'jniLibs');
  rmSync(jniLibraries, { recursive: true, force: true });

  for (const abi of ANDROID_ABIS) {
    const source = path.join(cargoOutput, abi, `lib${libraryName}.so`);
    requireFile(source);

    const abiDirectory = path.join(jniLibraries, abi);
    mkdirSync(abiDirectory, { recursive: true });
    cpSync(source, path.join(abiDirectory, OUTPUT_LIBRARY_NAME));
  }
}

export function exportAndroid(options: ExportAndroidOptions): void {
  const workingDirectory = process.cwd();
  const tauriDirectory = path.resolve(workingDirectory, options.tauriDir);
  const manifest = options.manifest
    ? path.resolve(workingDirectory, options.manifest)
    : path.join(tauriDirectory, 'crates/app-core/Cargo.toml');
  const outputDirectory = path.resolve(
    workingDirectory,
    options.outputDir ?? path.join(tauriDirectory, 'gen/tauri-native/android')
  );
  const configPath = path.join(tauriDirectory, 'tauri.conf.json');

  for (const requiredPath of [manifest, configPath]) {
    requireFile(requiredPath);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8')) as TauriConfig;
  const frontendDirectory = path.dirname(tauriDirectory);
  if (typeof config.build?.beforeBuildCommand === 'string') {
    message(`Building the Tauri microfrontend in ${frontendDirectory}`);
    execSync(config.build.beforeBuildCommand, {
      cwd: frontendDirectory,
      stdio: 'inherit',
    });
  }

  if (typeof config.build?.frontendDist !== 'string') {
    throw new Error(`${configPath} must define build.frontendDist`);
  }

  const frontendDist = path.resolve(
    tauriDirectory,
    config.build.frontendDist
  );
  requireFile(path.join(frontendDist, 'index.html'));

  const libraryName = readLibraryName(manifest);
  const targetDirectory = path.join(tauriDirectory, 'target/tauri-native');
  const cargoOutput = path.join(targetDirectory, 'android-jniLibs');
  const cargoEnvironment = {
    ...process.env,
    CARGO_TARGET_DIR: targetDirectory,
  };

  run('rustup', ['target', 'add', ...ANDROID_TARGETS]);
  rmSync(cargoOutput, { recursive: true, force: true });
  run(
    'cargo',
    [
      'ndk',
      '--platform',
      ANDROID_API_LEVEL,
      ...ANDROID_ABIS.flatMap((abi) => ['--target', abi]),
      '--output-dir',
      cargoOutput,
      'build',
      '--manifest-path',
      manifest,
      '--release',
    ],
    { env: cargoEnvironment }
  );

  mkdirSync(outputDirectory, { recursive: true });
  copyAndroidLibraries(cargoOutput, outputDirectory, libraryName);

  const assets = path.join(outputDirectory, 'assets/tauri-native');
  rmSync(assets, { recursive: true, force: true });
  cpSync(frontendDist, assets, { recursive: true });

  message(
    `Created ${path.join(outputDirectory, 'jniLibs')}\nCreated ${assets}`,
    '◆ '
  );
}
