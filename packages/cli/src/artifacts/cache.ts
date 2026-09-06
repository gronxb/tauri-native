import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { projectCopyRoot } from '../adapter/workspace.ts';
import { commandOutput, nativeDirectory } from '../discovery/native-tool.ts';
import type { ProjectModel } from '../discovery/project.ts';
import packageJson from '../../package.json' with { type: 'json' };
import { androidTools } from './android.ts';
import { sha256 } from './files.ts';
import { validateArtifactManifest } from './manifest.ts';

function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function outputPath(file: string): string {
  const parent = path.dirname(file);
  // Resolve existing parents (including macOS /tmp and /var aliases), but keep
  // the output leaf so validation can still reject a linked destination.
  return path.join(existsSync(parent) ? realpathSync(parent) : outputPath(parent), path.basename(file));
}

/** Hash actual bytes, including installed JS dependencies and linked local inputs. */
function tree(root: string, excluded: (file: string) => boolean): Record<string, string> {
  const files: Record<string, string> = {};
  const ancestors = new Set<string>();
  function visit(file: string) {
    if (excluded(file)) return;
    const relative = path.relative(root, file).split(path.sep).join('/');
    const info = statSync(file); // Follow links just as the disposable producer copy does.
    if (info.isDirectory()) {
      const real = realpathSync(file);
      if (ancestors.has(real)) { files[relative] = 'directory-cycle'; return; }
      ancestors.add(real);
      const names = readdirSync(file).sort();
      for (const name of names) visit(path.join(file, name));
      ancestors.delete(real);
    } else if (info.isFile()) files[relative] = `${info.mode & 0o777}:${sha256(readFileSync(file))}`;
    else throw new Error(`Incremental export requires ordinary files/directories: ${file}`);
  }
  visit(root); return files;
}

export function projectInputs(project: ProjectModel, output: string, copyRoot?: string) {
  output = outputPath(path.resolve(output));
  const original = projectCopyRoot(project);
  if (within(output, original)) throw new Error('The export directory must not contain the producer root.');
  const root = copyRoot ?? original;
  const mapped = (file: string) => path.join(root, path.relative(original, file));
  const generated = [path.join(project.workspaceRoot, 'target'), path.join(project.tauriDirectory, 'target'), path.join(project.tauriDirectory, 'gen'), output,
    ...(project.frontend.build ? [project.frontend.dist] : [])].filter(file => within(original, file)).map(mapped);
  const stageParent = mapped(path.dirname(output));
  const stagePrefix = `.${path.basename(output)}-stage-`;
  return tree(root, file => path.basename(file) === '.git' || generated.some(directory => within(directory, file)) || file === mapped(`${output}.lock`) || (path.dirname(file) === stageParent && path.basename(file).startsWith(stagePrefix)));
}

export function exportInputs(project: ProjectModel, output: string) {
  const configs: Record<string, string | null> = {};
  const directories = new Set([process.env.CARGO_HOME ?? path.join(homedir(), '.cargo')]);
  for (const start of new Set([project.tauriDirectory, process.cwd()])) {
    for (let directory = start; ; directory = path.dirname(directory)) {
      directories.add(path.join(directory, '.cargo'));
      for (const name of ['rust-toolchain', 'rust-toolchain.toml']) {
        const file = path.join(directory, name); configs[file] = existsSync(file) ? sha256(readFileSync(file)) : null;
      }
      if (directory === path.dirname(directory)) break;
    }
  }
  for (const directory of directories) for (const name of ['config', 'config.toml']) {
    const file = path.join(directory, name); configs[file] = existsSync(file) ? sha256(readFileSync(file)) : null;
  }
  return { files: projectInputs(project, output), configs, environment: sha256(JSON.stringify(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b)))) };
}

export function createExportCache(project: ProjectModel, platform: 'ios' | 'android', output: string) {
  output = outputPath(path.resolve(output));
  const before = exportInputs(project, output);
  const inputsHash = sha256(JSON.stringify(before));
  const run = (command: string, args: string[]) => commandOutput(command, args, undefined, true);
  const tools = [run('rustc', ['-vV']), run('cargo', ['-vV']), run('rustup', ['target', 'list', '--installed'])];
  if (platform === 'ios') tools.push(run('xcodebuild', ['-version']), run('xcrun', ['clang', '--version']), ...['iphoneos', 'iphonesimulator'].flatMap(sdk => [run('xcrun', ['--sdk', sdk, '--show-sdk-path']), run('xcrun', ['--sdk', sdk, '--show-sdk-version'])]));
  else {
    const ndk = androidTools(true);
    tools.push(run('cargo', ['ndk', '--version']), ndk.bin, run(path.join(ndk.bin, 'clang'), ['--version']), sha256(readFileSync(ndk.systemLibraries)));
  }
  const key = sha256(JSON.stringify({ format: 1, platform, abi: project.abiVersion, version: packageJson.version, inputsHash, tools,
    cli: sha256(readFileSync(new URL(import.meta.url))), native: tree(nativeDirectory, file => path.basename(file) === 'target'),
  }));
  const directory = path.join(project.tauriDirectory, 'target/tauri-native/cache', sha256(output).slice(0, 20));
  const receipt = path.join(directory, 'cache.json');
  const changed = () => {
    if (sha256(JSON.stringify(exportInputs(project, output))) !== inputsHash) throw Object.assign(new Error('Inputs changed during export; the previous artifact was preserved. Retry after edits settle.'), { code: 'inputs_changed' });
  };
  return {
    workspace: path.join(directory, 'workspace'),
    hit() {
      try {
        const previous = JSON.parse(readFileSync(receipt, 'utf8'));
        if (previous.key !== key || previous.manifest !== sha256(readFileSync(path.join(output, 'manifest.json')))) return false;
        validateArtifactManifest(output); return true;
      } catch { return false; }
    },
    verifyCopy(copy: string) {
      if (JSON.stringify(projectInputs(project, output, copy)) !== JSON.stringify(before.files)) throw Object.assign(new Error('Inputs changed while copying the producer; the previous artifact was preserved.'), { code: 'inputs_changed' });
    },
    record(stage: string) {
      changed();
      mkdirSync(directory, { recursive: true });
      writeFileSync(receipt, JSON.stringify({ key, manifest: sha256(readFileSync(path.join(stage, 'manifest.json'))) }) + '\n');
    },
  };
}
