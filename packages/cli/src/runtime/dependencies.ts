import { commandOutput } from '../discovery/native-tool.ts';

export interface RuntimeSelection {
  targets: string[];
  features: string[];
}

interface RuntimePackage {
  id: string;
  name: string;
  version: string;
  source: string | null;
  manifest_path: string;
}

export function resolveRuntimeDependencies(manifest: string, selection: RuntimeSelection) {
  const packages = new Map<string, RuntimePackage>();
  let plugins: Record<string, string> | undefined;
  for (const target of selection.targets) {
    // Cargo evaluates target predicates, aliases and optional features. Walk
    // from the selected app: metadata also contains unrelated workspace members.
    const metadata = JSON.parse(commandOutput('cargo', ['metadata', '--format-version', '1', '--locked', '--offline',
      '--manifest-path', manifest, '--filter-platform', target, '--features', selection.features.join(',')])) as {
      packages: RuntimePackage[];
      resolve: { root: string; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
    };
    const resolved = new Map(metadata.packages.map(pkg => [pkg.id, pkg]));
    const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
    const visited = new Set<string>();
    const pending = [metadata.resolve.root];
    const selected: Record<string, string> = {};
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const pkg = resolved.get(id)!;
      packages.set(id, pkg);
      if (pkg.name.startsWith('tauri-plugin-')) {
        if (!['tauri-plugin-geolocation@2.3.3', 'tauri-plugin-deep-link@2.4.10'].includes(`${pkg.name}@${pkg.version}`)) {
          throw new Error(`Retained mobile export has no native compatibility evidence for ${pkg.name}@${pkg.version} on ${target}. Desktop-only plugins keep their upstream restriction.`);
        }
        selected[pkg.name] = pkg.version;
      }
      pending.push(...nodes.get(id)!.deps.filter(dep => dep.dep_kinds.some(kind => kind.kind !== 'dev')).map(dep => dep.pkg));
    }
    const sorted = Object.fromEntries(Object.entries(selected).sort(([a], [b]) => a.localeCompare(b)));
    if (plugins && JSON.stringify(plugins) !== JSON.stringify(sorted)) {
      throw new Error('Retained export requires the same native plugin versions on every selected slice; export differing targets separately.');
    }
    plugins = sorted;
  }
  return { packages: [...packages.values()], plugins: plugins! };
}
