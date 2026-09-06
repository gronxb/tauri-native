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
import { prepareAdapter, type AdapterWorkspace } from '../adapter/workspace.ts';
import { discoverProject } from '../discovery/project.ts';
import { inventory, sha256 } from '../artifacts/files.ts';
import { ANDROID_ABIS, writeArtifactManifest } from '../artifacts/manifest.ts';
import { androidTools, validateAndroidArtifacts, type AndroidTools } from '../artifacts/android.ts';
import { publishArtifacts } from '../artifacts/staging.ts';

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

export { ANDROID_ABIS };

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
  const outputDirectory = path.resolve(options.outputDir ?? path.join(options.tauriDir, 'gen/tauri-native/android'));
  let adapter: AdapterWorkspace | undefined;
  let tools: AndroidTools;
  try {
    publishArtifacts(outputDirectory, stage => {
      const project = options.manifest ? undefined : discoverProject(options.tauriDir);
      tools = androidTools();
      adapter = project ? prepareAdapter(project) : undefined;
      exportAndroidArtifacts({ ...options, outputDir: stage }, adapter);
    }, stage => validateAndroidArtifacts(stage, tools));
    message(`Created validated Android artifacts in ${outputDirectory}`, '◆ ');
  }
  catch (error) {
    if (adapter) throw new Error(`${error instanceof Error ? error.message : error}\nGenerated source maps to ${adapter.sourceRoot}; original command line numbers are preserved.`);
    throw error;
  }
  finally { adapter?.cleanup(); }
}

function exportAndroidArtifacts(options: ExportAndroidOptions, adapter?: AdapterWorkspace): void {
  const workingDirectory = process.cwd();
  const tauriDirectory = path.resolve(workingDirectory, options.tauriDir);
  const manifest = adapter?.manifest ?? (options.manifest
    ? path.resolve(workingDirectory, options.manifest)
    : path.join(tauriDirectory, 'crates/app-core/Cargo.toml'));
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
  if (!adapter && typeof config.build?.beforeBuildCommand === 'string') {
    message(`Building the Tauri microfrontend in ${frontendDirectory}`);
    execSync(config.build.beforeBuildCommand, {
      cwd: frontendDirectory,
      stdio: 'inherit',
    });
  }

  if (typeof config.build?.frontendDist !== 'string') {
    throw new Error(`${configPath} must define build.frontendDist`);
  }

  const frontendDist = adapter?.frontendDist ?? path.resolve(
    tauriDirectory,
    config.build.frontendDist
  );
  requireFile(path.join(frontendDist, 'index.html'));

  const libraryName = adapter?.libraryName ?? readLibraryName(manifest);
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
      '--manifest-path',
      manifest,
      'rustc',
      '--release',
      '--lib',
      ...(adapter ? ['--locked'] : []),
      '--',
      '-C', 'link-arg=-Wl,-z,max-page-size=16384',
      '-C', 'link-arg=-Wl,-z,common-page-size=16384',
      '-C', `link-arg=-Wl,-soname,${OUTPUT_LIBRARY_NAME}`,
    ],
    // cargo-ndk also performs initial metadata discovery in its current directory.
    { env: cargoEnvironment, cwd: path.dirname(manifest) }
  );

  mkdirSync(outputDirectory, { recursive: true });
  copyAndroidLibraries(cargoOutput, outputDirectory, libraryName);

  const assets = path.join(outputDirectory, 'assets/tauri-native');
  rmSync(assets, { recursive: true, force: true });
  cpSync(frontendDist, assets, { recursive: true });

  if (adapter) {
    mkdirSync(path.join(outputDirectory, 'include'), { recursive: true });
    cpSync(adapter.header, path.join(outputDirectory, 'include/tauri_native.h'));
  }
  writeArtifactManifest(outputDirectory, {
    platform: 'android', minimumApiLevel: 24, pageSize: 16384,
    native: ANDROID_ABIS.map(abi => ({ abi, path: `jniLibs/${abi}/${OUTPUT_LIBRARY_NAME}` })),
    assets: 'assets/tauri-native', integration: null, header: adapter ? 'include/tauri_native.h' : null,
    source: {
      ...(adapter?.fingerprints ?? { cargoManifestSha256: sha256(readFileSync(manifest)), tauriConfigSha256: sha256(readFileSync(configPath)) }),
      frontendSha256: sha256(JSON.stringify(inventory(frontendDist))),
    },
  }, adapter?.model);
}
