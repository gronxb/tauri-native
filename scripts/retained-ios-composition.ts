import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { prepareComposition } from './retained-composition.ts';

type XcodeObject = {
  isa: string; name?: string; path?: string; sourceTree?: string; productType?: string;
  children?: string[]; files?: string[]; fileRef?: string; buildPhases?: string[];
  buildConfigurationList?: string; buildConfigurations?: string[]; mainGroup?: string;
  buildSettings?: Record<string, unknown>;
};
/** Preserve the original Apple startup owner and native client for both renderers. */
export function prepareIosProject(context: ReturnType<typeof prepareComposition>, rendererMinimum: string) {
  function fail(message: string): never { return context.fail(message); }
  if (process.platform !== 'darwin') fail('iOS composition requires macOS Apple project tools');
  const { artifact, manifest } = context;
  if (manifest.platform !== 'ios') return fail('requires an iOS format 2 artifact');
  function plist(file: string) {
    const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`cannot read Apple project metadata: ${file}: ${result.error ?? result.stderr}`);
    return JSON.parse(result.stdout);
  }
  function iosVersion(value: unknown): string {
    if (typeof value !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) fail('iOS deployment targets must be explicit numeric versions');
    return value;
  }
  function greaterVersion(a: string, b: string) {
    const left = a.split('.').map(Number), right = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0) ? a : b;
    return a;
  }
  const ios = path.join(artifact, 'ios'), bootstrap = manifest.bootstrap;
  if (['Podfile', 'Podfile.lock', 'Pods', '.xcode.env', '.xcode.env.local', 'assets/tauri-native-react', 'assets/tauri-native-lynx'].some(file => existsSync(path.join(ios, file))))
    fail('existing CocoaPods, Node environment or renderer assets require explicit integration');
  const projectFile = `${bootstrap.xcodeProject}/project.pbxproj`;
  const project = plist(path.join(ios, projectFile)) as { objects: Record<string, XcodeObject>; rootObject: string };
  const objects = project.objects;
  const targets = Object.values(objects).filter(item => item.isa === 'PBXNativeTarget');
  const target = targets[0];
  if (targets.length !== 1 || target?.name !== bootstrap.target || target.productType !== 'com.apple.product-type.application') fail('requires one original Tauri application target');
  if (Object.values(objects).some(item => item.isa === 'PBXShellScriptBuildPhase')) fail('existing native build scripts require explicit integration');
  const rootGroup = objects[project.rootObject]?.mainGroup;
  function sourcePath(id: string, visited = new Set<string>()): string {
    const item = objects[id];
    if (!item || visited.has(id)) fail('invalid Xcode source group graph');
    visited.add(id);
    if (id === rootGroup) return '';
    if (item.sourceTree === 'SOURCE_ROOT') return item.path ?? '';
    if (item.sourceTree !== '<group>') fail('unsupported Xcode source path');
    const parents = Object.entries(objects).filter(([, parent]) => parent.children?.includes(id));
    if (parents.length !== 1) fail('ambiguous Xcode source group');
    return path.posix.join(sourcePath(parents[0]![0], visited), item.path ?? '');
  }
  const sources: string[] = [], resources: string[] = [];
  for (const phase of target.buildPhases ?? []) {
    const item = objects[phase];
    if (!item || !['PBXSourcesBuildPhase', 'PBXResourcesBuildPhase'].includes(item.isa)) continue;
    for (const file of item.files ?? []) {
      const ref = objects[file]?.fileRef;
      if (!ref) fail('invalid original Xcode build input');
      (item.isa === 'PBXSourcesBuildPhase' ? sources : resources).push(sourcePath(ref));
    }
  }
  const mains = sources.filter(file => /^Sources\/[^/]+\/main\.mm$/.test(file));
  if (mains.length !== 1 || sources.filter(file => file === 'Sources/TauriNativeRuntime/TNRuntimeSession.mm').length !== 1 || !resources.includes('assets'))
    fail('requires the original main, one retained session client and bundled assets folder');
  const main = mains[0]!;
  const originalMain = readFileSync(path.join(ios, main), 'utf8');
  if (originalMain.replace(/\s+/g, ' ').trim() !== '#include "bindings/bindings.h" int main(int argc, char * argv[]) { ffi::start_app(); return 0; }')
    fail('custom iOS application entry point requires verified lifecycle integration');
  const configurations = objects[target.buildConfigurationList ?? '']?.buildConfigurations;
  if (!configurations?.length) fail('missing original Xcode build configurations');
  for (const id of configurations) {
    const settings = objects[id]?.buildSettings;
    const infoFile = settings?.INFOPLIST_FILE;
    if (typeof infoFile !== 'string' || !/^[\w.-]+\/Info\.plist$/.test(infoFile)) fail('unsupported original Info.plist path');
    const info = plist(path.join(ios, infoFile));
    if (info.UIApplicationSceneManifest || info.UIApplicationDelegateClassName) fail('custom iOS scene/delegate ownership requires verified integration');
  }
  let minimumOsVersion = greaterVersion(iosVersion(rendererMinimum), iosVersion(bootstrap.minimumOsVersion));
  for (const item of Object.values(objects)) {
    const value = item.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET;
    if (value !== undefined) minimumOsVersion = greaterVersion(minimumOsVersion, iosVersion(value));
  }
  for (const item of Object.values(objects)) if (item.isa === 'XCBuildConfiguration' && item.buildSettings)
    item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = minimumOsVersion;
  const encodedProject = spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(project), encoding: 'utf8' });
  if (encodedProject.status !== 0) fail(`cannot encode the composed Xcode project: ${encodedProject.stderr}`);
  return { projectFile, encodedProject: encodedProject.stdout, main, originalMain, minimumOsVersion, bootstrap,
    workspace: bootstrap.xcodeProject.replace(/\.xcodeproj$/, '.xcworkspace') };
}
