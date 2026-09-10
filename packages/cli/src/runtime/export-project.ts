import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverProject } from '../discovery/project.ts';
import { nativeTool } from '../discovery/native-tool.ts';
import { sha256 } from '../artifacts/files.ts';
import { prepareRuntime, validateCallerPolicy } from './workspace.ts';
import { resolveRuntimeDependencies } from './dependencies.ts';

export interface RetainedExportOptions {
  tauriDir: string;
  outputDir?: string;
  callerPolicy?: string;
  targets?: string;
  debug?: boolean;
  incremental?: boolean;
  force?: boolean;
  manifest?: string;
  header?: string;
  watch?: boolean;
}

export function readRuntimeExport(options: RetainedExportOptions, platform: 'ios' | 'android', targets: string[]) {
  if (options.manifest || options.header || options.watch) throw new Error('Retained export requires the ordinary producer; legacy manifests and watch need retained-runtime acceptance.');
  if (!options.callerPolicy) throw new Error('Retained export requires --caller-policy with explicit original WebView labels and exact command grants.');
  const policy = JSON.parse(readFileSync(path.resolve(options.callerPolicy), 'utf8'));
  validateCallerPolicy(policy);
  const project = discoverProject(options.tauriDir, process.cwd(), false, 'retained');
  const output = path.resolve(options.outputDir ?? path.join(project.tauriDirectory, `gen/tauri-native/retained-${platform}`));
  const config = JSON.parse(readFileSync(path.join(project.tauriDirectory, 'tauri.conf.json'), 'utf8'));
  const applicationId = config.identifier;
  if (typeof applicationId !== 'string' || !/^[\w-]+(?:\.[\w-]+)+$/.test(applicationId)) throw new Error('Retained export requires a valid Tauri application identifier.');
  const require = createRequire(path.join(path.dirname(project.tauriDirectory), 'package.json'));
  const cliPackage = require.resolve('@tauri-apps/cli/package.json');
  if (JSON.parse(readFileSync(cliPackage, 'utf8')).version !== '2.11.4') throw new Error('Retained mobile export verifies @tauri-apps/cli 2.11.4; install it in the ordinary producer.');
  const lock = nativeTool<{ package: { name: string; version: string }[] }>('manifest', path.join(project.workspaceRoot, 'Cargo.lock'));
  for (const [name, version] of [['wry', '0.55.1'], ['tauri-runtime-wry', '2.11.4']]) {
    const found = lock.package.filter(dependency => dependency.name === name);
    if (found.length !== 1 || found[0]!.version !== version) throw new Error(`Retained mobile native integration verifies ${name}@${version}.`);
  }
  const features = config.build?.features ?? [];
  if (!Array.isArray(features) || features.some(feature => typeof feature !== 'string' || !feature.trim())) throw new Error('Tauri build.features must be a list of Cargo feature names.');
  // Tauri CLI 2.11.4 build::setup retains defaults, adds configured features
  // and activates tauri/custom-protocol for both Debug and Release mobile builds.
  const selection = { targets, features: [...new Set(['tauri/custom-protocol', ...features])].sort() };
  const { plugins } = resolveRuntimeDependencies(project.manifest, selection);
  return { project, output, config, applicationId, policy, plugins, selection };
}

export function acquireRuntimeBuild(applicationId: string) {
  // Tauri CLI shares its app-identity options file across platforms/output paths.
  const lock = path.join(tmpdir(), `tauri-native-mobile-${sha256(applicationId).slice(0, 24)}.lock`);
  try { writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(`Another retained mobile export owns ${lock}. Remove it only after its recorded process has stopped.`);
  }
  return () => rmSync(lock, { force: true });
}

export function runtimeNpmDirectory(runtime: ReturnType<typeof prepareRuntime>) {
  const cwd = path.dirname(runtime.project.tauriDirectory);
  // Tauri reconstructs the package-manager command in native build scripts.
  // An absolute `node tauri.js` invocation becomes an invalid `node tauri`.
  const manifest = path.join(cwd, 'package.json');
  const npm = JSON.parse(readFileSync(manifest, 'utf8'));
  if (npm.scripts?.['tauri-native:runtime'] && npm.scripts['tauri-native:runtime'] !== 'tauri') throw new Error('Producer conflicts with the generated Tauri CLI script.');
  npm.scripts = { ...npm.scripts, 'tauri-native:runtime': 'tauri' };
  writeFileSync(manifest, JSON.stringify(npm, null, 2) + '\n');
  return cwd;
}
