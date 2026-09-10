import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function fail(message: string): never { throw new Error(`Retained Expo prebuild: ${message}`); }
export const read = (root: string, file: string) => readFileSync(path.join(root, file), 'utf8');
export function write(root: string, file: string, bytes: string | Buffer) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
}
export function replace(source: string, from: string, to: string) {
  if (source.split(from).length !== 2) fail(`unsupported template; expected one ${JSON.stringify(from)}`);
  return source.replace(from, to);
}
export function inventory(root: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return Object.entries(inventory(root, file));
    if (!entry.isFile()) fail(`generated path must be regular: ${file}`);
    return [[file, digest(readFileSync(path.join(root, file)))]];
  }));
}
export function plist(file: string): Record<string, any> {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
}
function writePlist(root: string, file: string, value: unknown) {
  write(root, file, execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(value) }));
}

/** Adapt generated copies for Expo's public custom-template entry. Tauri still starts the app. */
export function prepareAndroidTemplate(project: string, appId: string) {
  const source = `app/src/main/java/${appId.replaceAll('.', '/')}`;
  for (const name of ['TauriMainActivity.kt', 'MainApplication.kt']) if (existsSync(path.join(project, source, name))) fail(`artifact already owns ${name}`);
  const original = read(project, `${source}/MainActivity.kt`);
  write(project, `${source}/TauriMainActivity.kt`, replace(original, 'class MainActivity', 'class TauriMainActivity'));
  write(project, `${source}/MainActivity.kt`, replace(replace(read(project, `${source}/TauriNativeActivity.kt`), 'class TauriNativeActivity', 'class MainActivity'), ': MainActivity()', ': TauriMainActivity()').replaceAll('this@TauriNativeActivity', 'this@MainActivity'));
  rmSync(path.join(project, source, 'TauriNativeActivity.kt'));
  const integration = read(project, `${source}/TauriExpoIntegration.kt`);
  write(project, `${source}/MainApplication.kt`, integration.replaceAll('TauriNativeApplication', 'MainApplication').replaceAll('TauriNativeActivity', 'MainActivity'));
  rmSync(path.join(project, source, 'TauriExpoIntegration.kt'));
  const manifest = 'app/src/main/AndroidManifest.xml';
  write(project, manifest, replace(replace(read(project, manifest), `android:name="${appId}.TauriNativeApplication"`, 'android:name=".MainApplication"'), `android:name="${appId}.TauriNativeActivity"`, 'android:name=".MainActivity"'));
  return { activity: `${appId}.MainActivity` };
}

export function prepareIosTemplate(project: string, xcodeProject: string) {
  const file = `${xcodeProject}/project.pbxproj`, value = plist(path.join(project, file));
  const objects: Record<string, any> = value.objects;
  const infos = new Set(Object.values(objects).map(o => o.buildSettings?.INFOPLIST_FILE).filter(Boolean));
  if (infos.size !== 1) fail('CNG requires one original Info.plist');
  const infoFile = [...infos][0] as string, folder = path.posix.dirname(infoFile);
  const main = Object.values(objects).filter(o => o.isa === 'PBXFileReference' && (o.path === 'main.mm' || /^Sources\/[^/]+\/main\.mm$/.test(o.path ?? '')));
  const sources = readdirSync(path.join(project, 'Sources')).filter(name => existsSync(path.join(project, 'Sources', name, 'main.mm')));
  if (main.length !== 1 || sources.length !== 1) fail('CNG requires one generated Tauri executable entry');
  const oldMain = `Sources/${sources[0]}/main.mm`, newMain = `${folder}/AppDelegate.mm`;
  if (existsSync(path.join(project, newMain))) fail('artifact already owns the Expo startup discovery path');
  write(project, newMain, replace(read(project, oldMain), '#include "bindings/bindings.h"', `#include "../Sources/${sources[0]}/bindings/bindings.h"`));
  rmSync(path.join(project, oldMain));
  Object.assign(main[0], { path: newMain, sourceTree: 'SOURCE_ROOT' });
  const catalogs = Object.values(objects).filter(o => o.isa === 'PBXFileReference' && o.path === 'Assets.xcassets');
  if (catalogs.length !== 1 || existsSync(path.join(project, folder, 'Images.xcassets'))) fail('CNG requires the original Assets.xcassets catalog');
  renameSync(path.join(project, 'Assets.xcassets'), path.join(project, folder, 'Images.xcassets'));
  Object.assign(catalogs[0], { path: `${folder}/Images.xcassets`, sourceTree: 'SOURCE_ROOT' });
  const expoPlist = `${folder}/Supporting/Expo.plist`;
  if (existsSync(path.join(project, expoPlist))) fail('artifact already owns Expo.plist');
  writePlist(project, expoPlist, {});
  const ref = digest('tauri-native/expo-template/Expo.plist/reference').slice(0, 24).toUpperCase();
  const build = digest('tauri-native/expo-template/Expo.plist/build').slice(0, 24).toUpperCase();
  if (objects[ref] || objects[build]) fail('Expo resource identifier conflicts with the original Xcode project');
  objects[ref] = { isa: 'PBXFileReference', path: expoPlist, sourceTree: 'SOURCE_ROOT', lastKnownFileType: 'text.plist.xml' };
  objects[build] = { isa: 'PBXBuildFile', fileRef: ref };
  objects[objects[value.rootObject].mainGroup].children.push(ref);
  const target = Object.values(objects).find(o => o.isa === 'PBXNativeTarget');
  const resources = target?.buildPhases.map((id: string) => objects[id]).filter((o: any) => o.isa === 'PBXResourcesBuildPhase');
  if (resources?.length !== 1) fail('CNG requires one original resources phase');
  resources[0].files.push(build);
  for (const o of Object.values(objects)) {
    if (o.isa === 'XCBuildConfiguration') o.name = ({ debug: 'Debug', release: 'Release' } as Record<string, string>)[o.name] ?? o.name;
    if (o.isa === 'XCConfigurationList' && o.defaultConfigurationName) o.defaultConfigurationName = ({ debug: 'Debug', release: 'Release' } as Record<string, string>)[o.defaultConfigurationName] ?? o.defaultConfigurationName;
  }
  writePlist(project, file, value);
  // Use the installed CocoaPods parser to preserve the object graph while emitting OpenStep syntax.
  execFileSync('ruby', ['-rxcodeproj', '-e', 'Xcodeproj::Project.open(ARGV[0]).save', path.join(project, xcodeProject)], { stdio: 'pipe' });
  const schemes = `${xcodeProject}/xcshareddata/xcschemes`;
  for (const scheme of readdirSync(path.join(project, schemes))) if (scheme.endsWith('.xcscheme')) {
    const f = `${schemes}/${scheme}`;
    write(project, f, read(project, f).replaceAll('"debug"', '"Debug"').replaceAll('"release"', '"Release"'));
  }
  write(project, 'Podfile', replace(read(project, 'Podfile'), "'debug' => :debug, 'release' => :release", "'Debug' => :debug, 'Release' => :release"));
  write(project, '.gitignore', 'Pods/\nbuild/\n');
  return { infoFile, main: newMain, expoPlist, iconCatalog: `${folder}/Images.xcassets` };
}
