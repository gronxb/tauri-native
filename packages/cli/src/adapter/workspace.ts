import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandOutput, DiscoveryError, nativeDirectory, nativeTool } from '../discovery/native-tool.ts';
import { discoverProject, type ProjectModel, type SourceModel } from '../discovery/project.ts';
import { sha256 } from '../artifacts/files.ts';
import { syncAdapter } from './sync.ts';

function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export interface AdapterWorkspace {
  directory: string;
  manifest: string;
  header: string;
  frontendDist: string;
  model: SourceModel;
  sourceRoot: string;
  libraryName: string;
  fingerprints: Record<string, string>;
  cleanup(): void;
}

export function projectCopyRoot(project: ProjectModel): string {
  const frontendRoot = path.dirname(project.tauriDirectory);
  const copyRoot = within(project.workspaceRoot, frontendRoot) ? project.workspaceRoot : frontendRoot;
  if (!within(copyRoot, project.workspaceRoot) || !within(copyRoot, project.source) || !within(copyRoot, project.frontend.dist) || (project.frontend.build && !within(copyRoot, project.frontend.build.cwd))) {
    throw new DiscoveryError([{ file: project.manifest, message: 'The Cargo workspace and frontend build must share a project root; external build paths are not supported.' }]);
  }
  for (const dependency of project.cargoPackage.dependencies) {
    if (dependency.path && !within(copyRoot, dependency.path)) throw new DiscoveryError([{ file: project.manifest, message: `External path dependency ${dependency.name} is outside the copied project root.` }]);
  }
  return copyRoot;
}

export function projectFingerprints(project: ProjectModel): Record<string, string> {
  return Object.fromEntries(Object.entries({ rustEntry: project.source, cargoManifest: project.manifest, cargoLock: path.join(project.workspaceRoot, 'Cargo.lock'), tauriConfig: path.join(project.tauriDirectory, 'tauri.conf.json') }).map(([key, file]) => [`${key}Sha256`, sha256(readFileSync(file))]));
}

export function prepareAdapter(project: ProjectModel, cacheDirectory?: string, verifyCopy?: (copy: string) => void): AdapterWorkspace {
  const copyRoot = projectCopyRoot(project);
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'tauri-native-workspace-')));
  const copy = path.join(directory, 'producer');
  const map = (file: string) => path.join(copy, path.relative(copyRoot, file));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const dependencies: [string, string][] = [];
    const generatedRoots = [path.join(project.workspaceRoot, 'target'), path.join(project.tauriDirectory, 'target'), path.join(project.tauriDirectory, 'gen')];
    cpSync(copyRoot, copy, { recursive: true, dereference: true, filter(source) {
      if (path.basename(source) === '.git' || generatedRoots.some(root => within(root, source))) return false;
      if (path.basename(source) === 'node_modules') {
        dependencies.push([realpathSync(source), map(source)]);
        return false;
      }
      return true;
    } });
    for (const [source, target] of dependencies) { mkdirSync(path.dirname(target), { recursive: true }); symlinkSync(source, target, 'dir'); }
    verifyCopy?.(copy);
    // From this point, discovery, generation and hooks all use one captured
    // producer. Edits in the original checkout cannot mix into that snapshot.
    const captured = discoverProject(map(project.tauriDirectory), copy);
    const fingerprints = projectFingerprints(captured);
    const manifest = captured.manifest;
    const generatedSource = path.join(directory, 'generated.rs');
    const generatedManifest = path.join(directory, 'generated-Cargo.toml');
    const model = nativeTool<SourceModel>('generate', captured.source, generatedSource);
    nativeTool('prepare-manifest', manifest, generatedManifest);
    renameSync(generatedSource, captured.source);
    renameSync(generatedManifest, manifest);
    // Resolution happens only in the disposable copy; pruning the Tauri build
    // dependency may update this copy's lockfile, never the producer's lockfile.
    const metadata = JSON.parse(commandOutput('cargo', ['metadata', '--format-version', '1', '--manifest-path', manifest], copy)) as {
      packages: { id: string; name: string; manifest_path: string; source: string | null }[];
      resolve: { nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
    };
    const app = metadata.packages.find(pkg => realpathSync(pkg.manifest_path) === realpathSync(manifest));
    if (!app) throw new Error('Generated application is missing from Cargo metadata');
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const pkg = metadata.packages.find(pkg => pkg.id === id)!;
      if (pkg.name === 'tauri' || pkg.name.startsWith('tauri-runtime')) throw new DiscoveryError([{ file: project.manifest, message: 'A domain dependency still requires the Tauri runtime; export cannot preserve the single-owner boundary.' }]);
      if (pkg.source === null && !within(copy, realpathSync(pkg.manifest_path))) throw new DiscoveryError([{ file: project.manifest, message: `Dependency ${pkg.name} still points outside the generated workspace.` }]);
      for (const dependency of metadata.resolve.nodes.find(node => node.id === id)?.deps ?? []) {
        if (dependency.dep_kinds.some(kind => kind.kind === null)) visit(dependency.pkg);
      }
    };
    visit(app.id);
    const header = path.join(directory, 'include/tauri_native.h');
    mkdirSync(path.dirname(header), { recursive: true });
    cpSync(path.join(nativeDirectory, 'src/tauri_native.h'), header);
    if (captured.frontend.build) execSync(captured.frontend.build.script, { cwd: captured.frontend.build.cwd, stdio: 'inherit' });
    const frontendDist = captured.frontend.dist;
    if (!existsSync(path.join(frontendDist, 'index.html'))) throw new Error(`Frontend build did not create ${project.frontend.dist}/index.html`);
    if (cacheDirectory) {
      syncAdapter(directory, cacheDirectory);
      const cached = (file: string) => path.join(cacheDirectory, path.relative(directory, file));
      cleanup();
      return { directory: cacheDirectory, manifest: cached(manifest), header: cached(header), frontendDist: cached(frontendDist), model, sourceRoot: copyRoot, libraryName: captured.libraryName, fingerprints, cleanup() {} };
    }
    return { directory, manifest, header, frontendDist, model, sourceRoot: copyRoot, libraryName: captured.libraryName, fingerprints, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
