import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exportInputs, projectInputs, tree } from '../artifacts/cache.ts';
import { androidTools } from '../artifacts/android.ts';
import { sha256 } from '../artifacts/files.ts';
import { commandOutput, nativeDirectory, nativeTool } from '../discovery/native-tool.ts';
import type { ProjectModel } from '../discovery/project.ts';
import { readRetainedArtifacts } from '../../../../scripts/retained-artifacts.ts';
import { runtimeGeneratedPaths, type NativeCallerPolicy } from './workspace.ts';
import type { RuntimeSelection } from './dependencies.ts';

export function retainedInputs(project: ProjectModel, output: string) {
  return exportInputs(project, output, runtimeGeneratedPaths(project));
}

function dependencies(project: ProjectModel, selection: RuntimeSelection) {
  // Keep host build-script/proc-macro dependencies in the source fingerprint as
  // well as target dependencies. Include the features used by the actual build.
  const { packages } = JSON.parse(commandOutput('cargo', ['metadata', '--format-version', '1', '--locked', '--offline',
    '--manifest-path', project.manifest, '--features', selection.features.join(',')])) as {
    packages: { name: string; version: string; source: string | null; manifest_path: string }[];
  };
  // Native plugin build scripts create caches in registry directories. Hash
  // their actual authored inputs as well as Cargo.lock, including local patches.
  const generated = new Set(['.git', 'target', '.build', '.gradle', '.kotlin', '.tauri', 'node_modules']);
  return packages.filter(pkg => pkg.source !== null).map(pkg => {
    const root = path.dirname(pkg.manifest_path);
    const nativeBuilds = new Set(['android/build', 'mobile/android/build'].map(file => path.join(root, file)));
    return { name: pkg.name, version: pkg.version, source: pkg.source,
      inputsSha256: sha256(JSON.stringify(tree(root, file => generated.has(path.basename(file)) || nativeBuilds.has(file)))),
    };
  }).sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

export function createRuntimeCache(project: ProjectModel, output: string, platform: 'ios' | 'android', targets: string[], profile: 'debug' | 'release', policy: NativeCallerPolicy, selection: RuntimeSelection) {
  const before = retainedInputs(project, output);
  // The generated path-remapping wrapper can compose an explicit environment
  // wrapper. Cargo-config wrapper path resolution is not inferred or discarded.
  if (process.env.RUSTC_WRAPPER === undefined && process.env.CARGO_BUILD_RUSTC_WRAPPER === undefined) for (const [file, fingerprint] of Object.entries(before.configs)) {
    if (fingerprint && /[/\\]config(?:\.toml)?$/.test(file)) {
      const config = nativeTool<{ build?: { 'rustc-wrapper'?: string } }>('manifest', file);
      if (config.build?.['rustc-wrapper']) throw new Error('Retained export requires RUSTC_WRAPPER to explicitly select the producer Cargo compiler wrapper; its configured wrapper must not be silently replaced.');
    }
  }
  const inputsSha256 = sha256(JSON.stringify(before));
  const cargo = dependencies(project, selection);
  const tools: Record<string, string> = {};
  const tool = (name: string, command: string, args: string[]) => { tools[name] = sha256(commandOutput(command, args)); };
  tool('rustc', 'rustc', ['-vV']); tool('cargo', 'cargo', ['-vV']); tool('npm', 'npm', ['--version']);
  tools.node = sha256(process.version);
  if (platform === 'ios') {
    tool('xcode', 'xcodebuild', ['-version']); tool('clang', 'xcrun', ['clang', '--version']);
    for (const sdk of ['iphoneos', 'iphonesimulator']) tool(sdk, 'xcrun', ['--sdk', sdk, '--show-sdk-version']);
  } else {
    const ndk = androidTools();
    tool('ndkClang', path.join(ndk.bin, 'clang'), ['--version']); tool('cargoNdk', 'cargo', ['ndk', '--version']);
    tools.androidSystemLibraries = sha256(readFileSync(ndk.systemLibraries));
    tool('java', process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java', ['--version']);
  }
  const generator = {
    cli: sha256(readFileSync(new URL(import.meta.url))),
    discovery: sha256(JSON.stringify(tree(nativeDirectory, file => path.basename(file) === 'target'))),
    runtime: sha256(JSON.stringify(tree(path.join(nativeDirectory, '../runtime'), file => path.basename(file) === 'target'))),
  };
  const build = { schemaVersion: 1, platform, targets: targets.slice().sort(), profile, inputsSha256,
    callerPolicySha256: sha256(JSON.stringify(policy)), inputs: before.files,
    configurationSha256: sha256(JSON.stringify(before.configs)), environmentSha256: before.environment, tools, generator, cargoSelection: selection, cargo };
  const buildSha256 = sha256(JSON.stringify(build));
  const verify = () => {
    if (sha256(JSON.stringify(retainedInputs(project, output))) !== inputsSha256) throw new Error('Retained producer inputs changed during export; previous artifacts preserved. Retry after edits settle.');
    const after = dependencies(project, selection);
    if (JSON.stringify(after) !== JSON.stringify(cargo)) throw new Error(`Retained dependency inputs changed during export (${after.filter((pkg, index) => JSON.stringify(pkg) !== JSON.stringify(cargo[index])).map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}); previous artifacts preserved.`);
  };
  return {
    output, inputsSha256, buildSha256,
    verify,
    verifyCopy(producer: string) {
      if (JSON.stringify(projectInputs(project, output, producer, runtimeGeneratedPaths(project))) !== JSON.stringify(before.files)) {
        throw new Error('Retained producer inputs changed while copying; previous artifacts preserved.');
      }
    },
    hit() {
      try {
        const manifest = readRetainedArtifacts(output);
        return manifest.source.buildSha256 === buildSha256 && sha256(readFileSync(path.join(output, 'build.json'))) === manifest.source.buildReceiptSha256;
      } catch { return false; }
    },
    receipt(stage: string) {
      const bytes = JSON.stringify(build, null, 2) + '\n';
      writeFileSync(path.join(stage, 'build.json'), bytes);
      return { inputsSha256, buildSha256, buildReceiptSha256: sha256(bytes) };
    },
  };
}
