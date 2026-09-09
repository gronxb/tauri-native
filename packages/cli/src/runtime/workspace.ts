import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectCopyRoot } from '../adapter/workspace.ts';
import { commandOutput, nativeDirectory, nativeTool } from '../discovery/native-tool.ts';
import { discoverProject, type ProjectModel, type SourceModel } from '../discovery/project.ts';

export interface NativeCallerPolicy {
  version: 1;
  callers: Record<string, { webview: string; commands: string[] }>;
}

export function validateCallerPolicy(value: unknown): asserts value is NativeCallerPolicy {
  const policy = value as NativeCallerPolicy | undefined;
  if (!policy || policy.version !== 1 || Object.keys(policy).some(key => !['version', 'callers'].includes(key)) ||
      !policy.callers || typeof policy.callers !== 'object' || Array.isArray(policy.callers) || !Object.keys(policy.callers).length) {
    throw new Error('Native caller policy requires version 1 and explicit callers.');
  }
  for (const [id, caller] of Object.entries(policy.callers)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(id) || !caller || Object.keys(caller).some(key => !['webview', 'commands'].includes(key)) ||
        typeof caller.webview !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(caller.webview) ||
        !Array.isArray(caller.commands) || !caller.commands.length ||
        caller.commands.some(command => typeof command !== 'string' || !/^[a-zA-Z0-9_:|.-]+$/.test(command)) ||
        new Set(caller.commands).size !== caller.commands.length) {
      throw new Error(`Invalid native caller ${id}: use an exact WebView label and explicit commands without wildcards or duplicates.`);
    }
  }
}

export function prepareRuntime(project: ProjectModel, policy: NativeCallerPolicy) {
  validateCallerPolicy(policy);
  const sourceRoot = projectCopyRoot(project);
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'tauri-native-runtime-')));
  const producer = path.join(directory, 'producer');
  const map = (file: string) => path.join(producer, path.relative(sourceRoot, file));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const dependencies: [string, string][] = [];
    const excluded = new Set([path.join(project.workspaceRoot, 'target'), path.join(project.tauriDirectory, 'target'), path.join(project.tauriDirectory, 'gen')]);
    cpSync(sourceRoot, producer, { recursive: true, dereference: true, filter(source) {
      if (path.basename(source) === '.git' || excluded.has(source)) return false;
      if (path.basename(source) === 'node_modules') { dependencies.push([realpathSync(source), map(source)]); return false; }
      return true;
    } });
    for (const [source, target] of dependencies) { mkdirSync(path.dirname(target), { recursive: true }); symlinkSync(source, target, 'dir'); }
    const captured = discoverProject(map(project.tauriDirectory), producer, false, 'retained');
    const callersFile = path.join(path.dirname(captured.source), 'tauri-native-callers.json');
    if (existsSync(callersFile) || captured.cargoPackage.dependencies.some(dependency => dependency.name === 'tauri-native-runtime')) {
      throw new Error('Producer conflicts with the generated tauri-native runtime integration.');
    }
    const runtime = path.join(directory, 'runtime');
    mkdirSync(runtime);
    for (const file of ['Cargo.toml', 'src', 'tauri_native_runtime.h']) {
      cpSync(path.join(nativeDirectory, '../runtime', file), path.join(runtime, file), { recursive: true });
    }
    const generated = path.join(directory, 'generated.rs');
    const model = nativeTool<SourceModel>('generate-runtime', captured.source, generated);
    renameSync(generated, captured.source);
    writeFileSync(callersFile, JSON.stringify(policy, null, 2) + '\n');
    writeFileSync(captured.manifest, readFileSync(captured.manifest, 'utf8') +
      `\n[dependencies.tauri-native-runtime]\npath = ${JSON.stringify(path.relative(captured.tauriDirectory, runtime))}\n`);
    // The added package is resolved only in this disposable copy. Tauri,
    // tauri-build, application setup, command macros and capabilities stay intact.
    commandOutput('cargo', ['metadata', '--format-version', '1', '--manifest-path', captured.manifest], producer);
    return { directory, producer, project: captured, model, runtime, sourceRoot, cleanup };
  } catch (error) { cleanup(); throw error; }
}
