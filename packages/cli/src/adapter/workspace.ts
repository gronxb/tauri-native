import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandOutput, DiscoveryError, nativeDirectory, nativeTool } from '../discovery/native-tool.ts';
import type { ProjectModel, SourceModel } from '../discovery/project.ts';
import { sha256 } from '../artifacts/files.ts';

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

export function prepareAdapter(project: ProjectModel): AdapterWorkspace {
  const frontendRoot = path.dirname(project.tauriDirectory);
  const copyRoot = within(project.workspaceRoot, frontendRoot) ? project.workspaceRoot : frontendRoot;
  if (!within(copyRoot, project.workspaceRoot) || !within(copyRoot, project.source) || !within(copyRoot, project.frontend.dist) || (project.frontend.build && !within(copyRoot, project.frontend.build.cwd))) {
    throw new DiscoveryError([{ file: project.manifest, message: 'The Cargo workspace and frontend build must share a project root; external build paths are not supported.' }]);
  }
  for (const dependency of project.cargoPackage.dependencies) {
    if (dependency.path && !within(copyRoot, dependency.path)) throw new DiscoveryError([{ file: project.manifest, message: `External path dependency ${dependency.name} is outside the copied project root.` }]);
  }
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'tauri-native-workspace-')));
  const copy = path.join(directory, 'producer');
  const map = (file: string) => path.join(copy, path.relative(copyRoot, file));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  try {
    const fingerprints = Object.fromEntries(Object.entries({ rustEntry: project.source, cargoManifest: project.manifest, cargoLock: path.join(project.workspaceRoot, 'Cargo.lock'), tauriConfig: path.join(project.tauriDirectory, 'tauri.conf.json') }).map(([key, file]) => [`${key}Sha256`, sha256(readFileSync(file))]));
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
    const manifest = map(project.manifest);
    const model = nativeTool<SourceModel>('generate', project.source, map(project.source));
    nativeTool('prepare-manifest', project.manifest, manifest);
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
    if (project.frontend.build) execSync(project.frontend.build.script, { cwd: map(project.frontend.build.cwd), stdio: 'inherit' });
    const frontendDist = map(project.frontend.dist);
    if (!existsSync(path.join(frontendDist, 'index.html'))) throw new Error(`Frontend build did not create ${project.frontend.dist}/index.html`);
    return { directory, manifest, header, frontendDist, model, sourceRoot: copyRoot, libraryName: project.libraryName, fingerprints, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
