import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { commandOutput } from '../discovery/native-tool.ts';
import { sha256 } from '../artifacts/files.ts';

interface ProjectObject {
  isa: string;
  name?: string;
  path?: string;
  sourceTree?: string;
  children?: string[];
  buildPhases?: string[];
  fileRef?: string;
  files?: string[];
  lastKnownFileType?: string;
  buildSettings?: Record<string, unknown>;
}

/** Xcode, not the CLI archive's directory name, selects the Rust target. */
export function selectIosRuntimeArchitecture(native: string, arch: 'arm64' | 'x86_64') {
  const projects = readdirSync(native).filter(file => file.endsWith('.xcodeproj'));
  if (projects.length !== 1) throw new Error('Retained iOS export requires one standard Tauri Xcode project.');
  const file = path.join(native, projects[0]!, 'project.pbxproj');
  let source = readFileSync(file, 'utf8');
  // Keep OpenStep syntax: Tauri's agvtool version update cannot read XML plists.
  for (const key of ['ARCHS', 'VALID_ARCHS']) {
    const setting = new RegExp(`(^\\s*${key} = )[^;]+;`, 'gm');
    if (!setting.test(source)) throw new Error(`Expected standard Tauri Xcode ${key} settings.`);
    source = source.replace(setting, `$1${arch};`);
  }
  // CLI 2.11.4 xcode-script replaces every simulator ARCHS with its own host
  // architecture. Its explicit x86_64 branch still selects the simulator Rust
  // triple/SDK when the display-name shortcut is disabled. Keep the real SDKROOT.
  const platform = '--platform ${PLATFORM_DISPLAY_NAME:?}';
  source = source.replace('--platform iOS --sdk-root', `${platform} --sdk-root`);
  if (!source.includes(`${platform} --sdk-root`)) throw new Error('Expected the standard Tauri iOS Rust build script platform argument.');
  if (arch === 'x86_64') source = source.replace(platform, '--platform iOS');
  writeFileSync(file, source);
}

/** Preserve the built Tauri iOS bootstrap/Info.plist and link a captured XCFramework. */
export function copyIosRuntimeProject(native: string, destination: string, framework: string, runtime: string, architectures: { device: string[]; simulator: string[] }) {
  if (existsSync(destination)) throw new Error('Capture iOS runtime into a new staging directory.');
  const projects = readdirSync(native).filter(file => file.endsWith('.xcodeproj'));
  if (projects.length !== 1) throw new Error('Retained iOS export requires one standard Tauri Xcode project.');
  const projectPath = path.join(projects[0]!, 'project.pbxproj');
  const project = JSON.parse(commandOutput('plutil', ['-convert', 'json', '-o', '-', path.join(native, projectPath)])) as { objects: Record<string, ProjectObject> };
  const objects = project.objects;
  const scripts = Object.entries(objects).filter(([, object]) => object.isa === 'PBXShellScriptBuildPhase');
  if (scripts.length !== 1 || scripts[0]![1].name !== 'Build Rust Code') throw new Error('Retained iOS export needs compatibility evidence for custom native build scripts.');
  const targets = Object.values(objects).filter(object => object.isa === 'PBXNativeTarget');
  if (targets.length !== 1 || targets[0]!.buildPhases?.filter(id => id === scripts[0]![0]).length !== 1) throw new Error('Expected one Tauri iOS bootstrap target and Rust build phase.');
  targets[0]!.buildPhases = targets[0]!.buildPhases!.filter(id => id !== scripts[0]![0]);
  delete objects[scripts[0]![0]];
  const libraries = Object.values(objects).filter(object => object.isa === 'PBXFileReference' && object.path === 'libapp.a');
  if (libraries.length !== 1) throw new Error('Expected the standard Tauri libapp.a dependency.');
  libraries[0]!.path = 'TauriNativeRuntime.xcframework';
  libraries[0]!.lastKnownFileType = 'wrapper.xcframework';
  libraries[0]!.sourceTree = 'SOURCE_ROOT';
  const sourceGroups = Object.entries(objects).filter(([, object]) => object.isa === 'PBXGroup' && object.path === '../../src');
  if (sourceGroups.length !== 1) throw new Error('Expected the standard Tauri source navigation group.');
  const removed = new Set<string>();
  function remove(id: string) { removed.add(id); for (const child of objects[id]?.children ?? []) remove(child); }
  remove(sourceGroups[0]![0]);
  for (const object of Object.values(objects)) {
    if (object.fileRef && removed.has(object.fileRef)) throw new Error('Native Xcode compilation refers to producer Rust sources.');
    if (object.children) object.children = object.children.filter(id => !removed.has(id));
    if (object.buildSettings) for (const [key, value] of Object.entries(object.buildSettings)) {
      if (key.startsWith('LIBRARY_SEARCH_PATHS') && typeof value === 'string') object.buildSettings[key] = value.replace(/\$\(PROJECT_DIR\)\/Externals\/(?:arm64|x86_64)\/\$\(CONFIGURATION\) ?/g, '');
    }
    // Tauri CLI narrows the generated project to its most recently built
    // target. The portable project must expose every selected XCFramework slice.
    if (object.buildSettings?.ARCHS) {
      object.buildSettings.ARCHS = '$(ARCHS_STANDARD)';
      object.buildSettings.VALID_ARCHS = [...new Set([...architectures.device, ...architectures.simulator])].join(' ');
      object.buildSettings.SUPPORTED_PLATFORMS = [architectures.device.length ? 'iphoneos' : '', architectures.simulator.length ? 'iphonesimulator' : ''].filter(Boolean).join(' ');
      if (architectures.device.length) object.buildSettings['ARCHS[sdk=iphoneos*]'] = architectures.device.join(' ');
      if (architectures.simulator.length) object.buildSettings['ARCHS[sdk=iphonesimulator*]'] = architectures.simulator.join(' ');
    }
  }
  for (const id of removed) delete objects[id];
  const sourceGroupsForNative = Object.values(objects).filter(object => object.isa === 'PBXGroup' && object.path === 'Sources');
  const phases = Object.values(objects).filter(object => object.isa === 'PBXSourcesBuildPhase');
  if (sourceGroupsForNative.length !== 1 || phases.length !== 1) throw new Error('Expected one native Tauri source group and compile phase.');
  function add(name: string, value: ProjectObject) {
    const id = sha256(`tauri-native-runtime:${name}`).slice(0, 24).toUpperCase();
    if (objects[id]) throw new Error('Xcode project conflicts with generated runtime objects.');
    objects[id] = value; return id;
  }
  const children = ['TNRuntimeSession.h', 'TNRuntimeSession.mm', 'tauri_native_runtime.h'].map(file => {
    const id = add(file, { isa: 'PBXFileReference', path: file, sourceTree: '<group>', lastKnownFileType: file.endsWith('.mm') ? 'sourcecode.cpp.objcpp' : 'sourcecode.c.h' });
    if (file.endsWith('.mm')) phases[0]!.files!.push(add('compile-session', { isa: 'PBXBuildFile', fileRef: id }));
    return id;
  });
  sourceGroupsForNative[0]!.children!.push(add('session-group', { isa: 'PBXGroup', path: 'TauriNativeRuntime', sourceTree: '<group>', children }));
  for (const object of Object.values(objects)) if (object.path && (path.isAbsolute(object.path) || object.path.split('/').includes('..'))) {
    throw new Error(`Native Xcode input requires the producer or an external source: ${object.path}`);
  }
  const omitted = new Set(['build', 'Externals', 'Pods', 'Podfile', 'Podfile.lock', 'project.yml', '.DS_Store']);
  cpSync(native, destination, { recursive: true, dereference: true, filter: source => {
    const relative = path.relative(native, source).split(path.sep).join('/');
    return !omitted.has(relative) && !relative.split('/').includes('xcuserdata') && !relative.endsWith('.xcworkspace');
  } });
  cpSync(framework, path.join(destination, 'TauriNativeRuntime.xcframework'), { recursive: true });
  const sessions = path.join(destination, 'Sources/TauriNativeRuntime');
  cpSync(path.join(runtime, 'ios'), sessions, { recursive: true });
  cpSync(path.join(runtime, 'tauri_native_runtime.h'), path.join(sessions, 'tauri_native_runtime.h'));
  const output = path.join(destination, projectPath);
  writeFileSync(output, JSON.stringify(project));
  commandOutput('plutil', ['-convert', 'xml1', output]);
  for (const file of readdirSync(destination, { recursive: true, encoding: 'utf8' })) {
    if (!/\.(?:pbxproj|plist|xcconfig|h|m|mm|swift|entitlements)$/.test(file)) continue;
    if (readFileSync(path.join(destination, file), 'utf8').includes(native)) throw new Error(`iOS native input retains the producer path: ${file}`);
  }
  const minimums = [...new Set(Object.values(objects).flatMap(object => object.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET == null ? [] : [String(object.buildSettings.IPHONEOS_DEPLOYMENT_TARGET)]))];
  if (minimums.length !== 1) throw new Error('Retained iOS export requires one unambiguous deployment target.');
  return { project: projects[0]!, target: targets[0]!.name!, minimumOsVersion: minimums[0]! };
}
