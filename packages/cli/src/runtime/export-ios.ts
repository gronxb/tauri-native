import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { commandOutput } from '../discovery/native-tool.ts';
import { inventory, sha256 } from '../artifacts/files.ts';
import { publishArtifacts } from '../artifacts/staging.ts';
import { run } from '../utils/process.ts';
import { message } from '../utils/output.ts';
import { generateCommands } from '../types/commands.ts';
import { prepareRuntime } from './workspace.ts';
import { copyIosRuntimeProject } from './ios-project.ts';
import { readRuntimeExport, acquireRuntimeBuild, runtimeNpmDirectory, type RetainedExportOptions } from './export-project.ts';
import { readRetainedArtifacts, type RetainedIosArtifact } from '../../../../scripts/retained-artifacts.ts';
import packageJson from '../../package.json' with { type: 'json' };
import { createRuntimeCache } from './cache.ts';

const iosTargets = {
  aarch64: { rust: 'aarch64-apple-ios', arch: 'arm64', variant: 'device' },
  'aarch64-sim': { rust: 'aarch64-apple-ios-sim', arch: 'arm64', variant: 'simulator' },
  x86_64: { rust: 'x86_64-apple-ios', arch: 'x86_64', variant: 'simulator' },
} as const;
const roots = new Set(['manifest.json', 'build.json', 'commands.json', 'commands.ts', 'callers.json', 'include', 'ios']);

export function exportRetainedIos(options: RetainedExportOptions) {
  if (process.platform !== 'darwin') throw new Error('Retained iOS export requires macOS and Xcode.');
  const targets = (options.targets ?? Object.keys(iosTargets).join(',')).split(',') as (keyof typeof iosTargets)[];
  if (!targets.length || new Set(targets).size !== targets.length || targets.some(target => !Object.hasOwn(iosTargets, target))) throw new Error('Select unique retained iOS --targets from aarch64,aarch64-sim,x86_64.');
  const { project, output, applicationId, policy, plugins } = readRuntimeExport(options, 'ios');
  const release = acquireRuntimeBuild(applicationId);
  const profile = options.debug ? 'debug' : 'release';
  let runtime: ReturnType<typeof prepareRuntime> | undefined;
  try {
    const cache = createRuntimeCache(project, output, 'ios', targets, profile, policy);
    if (options.incremental && !options.force && cache.hit()) { cache.verify(); message(`Reused validated retained iOS artifacts in ${output}`, '◆ '); return; }
    publishArtifacts(output, stage => {
      runtime = prepareRuntime(project, policy, cache);
      const cwd = runtimeNpmDirectory(runtime);
      const env = { ...process.env, NODE_OPTIONS: '', CARGO_TARGET_DIR: path.resolve(process.env.CARGO_TARGET_DIR ?? path.join(project.tauriDirectory, 'target/tauri-native/retained-build')) };
      run('npm', ['run', 'tauri-native:runtime', '--', 'ios', 'init', '--ci', '--skip-targets-install'], { cwd, env });
      const native = path.join(runtime.project.tauriDirectory, 'gen/apple');
      const libraries = path.join(runtime.directory, 'libraries');
      mkdirSync(libraries);
      for (const target of targets) {
        run('cargo', ['clean', '--package', 'tauri', ...Object.keys(plugins).flatMap(name => ['--package', name]),
          '--target', iosTargets[target].rust, '--manifest-path', runtime.project.manifest], { cwd, env });
        // The CLI's final app rename requires a fresh destination for each archive.
        rmSync(path.join(native, 'build'), { recursive: true, force: true });
        run('npm', ['run', 'tauri-native:runtime', '--', 'ios', 'build', '--ci', ...(options.debug ? ['--debug'] : []), '--target', target, '--no-sign'], { cwd, env });
        cpSync(path.join(native, 'Externals', iosTargets[target].arch, profile, 'libapp.a'), path.join(libraries, `${target}.a`));
      }
      const frameworkArguments: string[] = [];
      for (const variant of ['device', 'simulator'] as const) {
        const selected = targets.filter(target => iosTargets[target].variant === variant);
        if (!selected.length) continue;
        const directory = path.join(libraries, variant); mkdirSync(directory);
        const library = path.join(directory, 'libapp.a');
        if (selected.length === 1) cpSync(path.join(libraries, `${selected[0]}.a`), library);
        else run('lipo', ['-create', ...selected.map(target => path.join(libraries, `${target}.a`)), '-output', library]);
        frameworkArguments.push('-library', library);
      }
      const framework = path.join(runtime.directory, 'TauriNativeRuntime.xcframework');
      run('xcodebuild', ['-create-xcframework', ...frameworkArguments, '-output', framework]);
      const captured = copyIosRuntimeProject(native, path.join(stage, 'ios'), framework, runtime.runtime);
      mkdirSync(path.join(stage, 'include'));
      cpSync(path.join(runtime.runtime, 'tauri_native_runtime.h'), path.join(stage, 'include/tauri_native_runtime.h'));
      writeFileSync(path.join(stage, 'commands.json'), JSON.stringify(runtime.model, null, 2) + '\n');
      if (runtime.model.typeGraph) writeFileSync(path.join(stage, 'commands.ts'), generateCommands(runtime.model));
      const callerBytes = JSON.stringify(policy, null, 2) + '\n';
      writeFileSync(path.join(stage, 'callers.json'), callerBytes);
      const slices = retainedIosSlices(stage);
      const expected = targets.map(target => `${iosTargets[target].variant}:${iosTargets[target].arch}`).sort();
      if (JSON.stringify(slices.flatMap(slice => slice.architectures.map(arch => `${slice.variant}:${arch}`)).sort()) !== JSON.stringify(expected)) throw new Error('XCFramework platforms/architectures differ from selected iOS targets.');
      const manifest: RetainedIosArtifact = { formatVersion: 2, abiVersion: 3, platform: 'ios', generator: { name: '@tauri-native/cli', version: packageJson.version },
        compatibility: { mode: 'retained', tauri: '2.11.5', tauriCli: '2.11.4', wry: '0.55.1', tauriRuntimeWry: '2.11.4' }, profile,
        bootstrap: { owner: 'tauri', project: 'ios', xcodeProject: captured.project, target: captured.target, applicationId, minimumOsVersion: captured.minimumOsVersion },
        plugins, native: slices, commands: 'commands.json', callers: 'callers.json', source: { ...cache.receipt(stage), callerPolicySha256: sha256(callerBytes) }, files: inventory(stage) };
      writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    }, stage => {
      const manifest = readRetainedArtifacts(stage);
      if (manifest.platform !== 'ios') throw new Error('Expected retained iOS artifacts.');
      if (JSON.stringify(retainedIosSlices(stage)) !== JSON.stringify(manifest.native)) throw new Error('XCFramework differs from the retained receipt.');
      for (const slice of manifest.native) {
        const library = path.join(stage, slice.path);
        const architectures = commandOutput('lipo', ['-archs', library]).trim().split(/\s+/).sort();
        if (architectures.join(',') !== slice.architectures.join(',')) throw new Error(`Incorrect iOS architecture: ${slice.path}`);
        for (const arch of architectures) {
          const symbols = commandOutput('nm', ['--no-llvm-bc', '-arch', arch!, '-gU', library]);
          // Deep-link uses Tauri's original iOS RunEvent::Opened lifecycle;
          // geolocation registers a separate Swift plugin entry point.
          for (const symbol of ['tauri_native_runtime_request', 'tauri_native_runtime_string_free', 'start_app', ...(manifest.plugins['tauri-plugin-geolocation'] ? ['init_plugin_geolocation'] : [])]) {
            if (!new RegExp(`\\bT _${symbol}\\s*$`, 'm').test(symbols)) throw new Error(`Missing ${symbol} in retained iOS ${arch} library.`);
          }
        }
      }
      cache.verify();
    }, roots);
    message(`Created retained Tauri iOS bootstrap and ABI 3 artifacts in ${output}`, '◆ ');
  } finally { try { runtime?.cleanup(); } finally { release(); } }
}

function retainedIosSlices(directory: string): RetainedIosArtifact['native'] {
  const root = 'ios/TauriNativeRuntime.xcframework';
  const info = JSON.parse(commandOutput('plutil', ['-convert', 'json', '-o', '-', path.join(directory, root, 'Info.plist')])) as {
    AvailableLibraries: { LibraryIdentifier: string; LibraryPath: string; SupportedPlatform: string; SupportedPlatformVariant?: string; SupportedArchitectures: ('arm64' | 'x86_64')[] }[];
  };
  if (!Array.isArray(info.AvailableLibraries) || !info.AvailableLibraries.length) throw new Error('Missing retained iOS XCFramework slices.');
  return info.AvailableLibraries.map(library => {
    if (library.SupportedPlatform !== 'ios' || ![undefined, 'simulator'].includes(library.SupportedPlatformVariant) || !/^[\w-]+$/.test(library.LibraryIdentifier) || library.LibraryPath !== 'libapp.a') throw new Error('Invalid retained iOS XCFramework slice.');
    return { path: `${root}/${library.LibraryIdentifier}/${library.LibraryPath}`, architectures: library.SupportedArchitectures.slice().sort(),
      variant: library.SupportedPlatformVariant === 'simulator' ? 'simulator' as const : 'device' as const };
  }).sort((a, b) => a.variant.localeCompare(b.variant));
}
