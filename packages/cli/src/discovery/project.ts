import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { commandOutput, DiscoveryError, nativeTool } from './native-tool.ts';

export interface CommandModel {
  name: string;
  async?: boolean;
  parameters: { name: string; key: string; type: string }[];
  output: string;
  line: number;
  column: number;
}

export interface SourceModel {
  schemaVersion: number;
  abiVersion: 1 | 2;
  commands: CommandModel[];
}

interface CargoPackage {
  id: string;
  name: string;
  version: string;
  edition: string;
  manifest_path: string;
  targets: { name: string; kind: string[]; src_path: string }[];
  dependencies: { name: string; rename: string | null; req: string; path?: string; kind: string | null; target: string | null }[];
  features: Record<string, string[]>;
}

export interface ProjectModel extends SourceModel {
  manifest: string;
  workspaceRoot: string;
  tauriDirectory: string;
  source: string;
  libraryName: string;
  package: { name: string; version: string; edition: string };
  frontend: { dist: string; build?: { script: string; cwd: string } };
  cargoPackage: CargoPackage;
}

function reject(file: string, message: string): never {
  throw new DiscoveryError([{ file, message }]);
}

export function discoverProject(tauriDir: string, cwd = process.cwd()): ProjectModel {
  const requestedDirectory = path.resolve(cwd, tauriDir);
  const tauriDirectory = existsSync(requestedDirectory) ? realpathSync(requestedDirectory) : requestedDirectory;
  const manifest = path.join(tauriDirectory, 'Cargo.toml');
  const configPath = path.join(tauriDirectory, 'tauri.conf.json');
  for (const file of [manifest]) {
    if (!existsSync(file)) reject(file, 'Required file does not exist; select the ordinary Tauri Rust directory with --tauri-dir.');
  }
  for (const file of ['Tauri.toml', 'tauri.conf.json5', 'tauri.ios.conf.json', 'tauri.android.conf.json', 'tauri.macos.conf.json', 'tauri.windows.conf.json', 'tauri.linux.conf.json', 'permissions']) {
    if (existsSync(path.join(tauriDirectory, file))) reject(path.join(tauriDirectory, file), 'Configuration overlays, alternate formats and application ACLs need an explicit compatibility proof.');
  }
  if (!existsSync(configPath)) reject(configPath, 'Required file does not exist: tauri.conf.json.');
  if (process.env.TAURI_CONFIG) reject(configPath, 'TAURI_CONFIG environment overrides require an explicit compatibility proof.');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (config.plugins && Object.keys(config.plugins).length) reject(configPath, 'Plugin configuration is not supported by native export.');
  const dist = config.build?.frontendDist;
  if (typeof dist !== 'string' || /^[a-z][a-z\d+.-]*:/i.test(dist)) reject(configPath, 'build.frontendDist must name a local frontend directory.');
  let build: ProjectModel['frontend']['build'];
  const hook = config.build?.beforeBuildCommand;
  if (typeof hook === 'string') build = { script: hook, cwd: path.dirname(tauriDirectory) };
  else if (hook != null) {
    if (typeof hook !== 'object' || typeof hook.script !== 'string' || (hook.cwd != null && typeof hook.cwd !== 'string') || Object.keys(hook).some(key => !['script', 'cwd'].includes(key))) {
      reject(configPath, 'beforeBuildCommand must be a string or { script, cwd? }.');
    }
    build = { script: hook.script, cwd: path.resolve(path.dirname(tauriDirectory), hook.cwd ?? '.') };
  }
  // --no-deps avoids resolving/downloading/building the application. --locked
  // makes any required lockfile update an error rather than a source mutation.
  const metadata = JSON.parse(commandOutput('cargo', ['metadata', '--format-version', '1', '--no-deps', '--locked', '--offline', '--manifest-path', manifest], cwd)) as { packages: CargoPackage[]; workspace_root: string };
  const app = metadata.packages.find(item => realpathSync(item.manifest_path) === realpathSync(manifest));
  if (!app) reject(manifest, 'The selected manifest must be an application package, not a virtual workspace.');
  const libraries = app.targets.filter(target => target.kind.some(kind => ['lib', 'rlib', 'staticlib', 'cdylib'].includes(kind)));
  if (libraries.length !== 1) reject(manifest, 'Expected one ordinary Rust library target.');
  const library = libraries[0]!;
  const tauri = app.dependencies.find(dep => dep.name === 'tauri');
  if (!tauri || app.dependencies.some(dep => dep.name === 'tauri' && (dep.rename || dep.target))) reject(manifest, 'Expected an ordinary, unaliased Tauri dependency without target overrides.');
  const lockPath = path.join(metadata.workspace_root, 'Cargo.lock');
  if (!existsSync(lockPath)) reject(lockPath, 'An existing Cargo.lock is required to verify the resolved Tauri version without changing producer dependencies.');
  const lock = nativeTool<{ package: { name: string; version: string }[] }>('manifest', lockPath);
  const versions = lock.package.filter(item => item.name === 'tauri');
  if (versions.length !== 1 || versions[0]!.version !== '2.11.5') reject(lockPath, 'Only resolved Tauri 2.11.5 is verified by this compatibility contract.');
  for (const target of app.targets.filter(target => target.kind.includes('custom-build'))) nativeTool('inspect-build', target.src_path);
  const source = nativeTool<SourceModel>('inspect', library.src_path);
  return {
    ...source, manifest, workspaceRoot: metadata.workspace_root, tauriDirectory,
    source: library.src_path, libraryName: library.name,
    package: { name: app.name, version: app.version, edition: app.edition },
    frontend: { dist: path.resolve(tauriDirectory, dist), ...(build ? { build } : {}) },
    cargoPackage: app,
  };
}
