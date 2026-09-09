import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import type { AndroidCompositionOptions, IosCompositionOptions } from './retained-compose-types.d.cts';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const kotlin = (value: string) => JSON.stringify(value).replaceAll('$', '\\$');
const groovy = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
function fail(message: string): never { throw new Error(`Retained RN composition: ${message}`); }
function read(root: string, file: string) { return readFileSync(path.join(root, file), 'utf8'); }
function write(root: string, file: string, bytes: string | Buffer) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
}
function replaceOnce(value: string, from: string, to: string, description: string) {
  if (value.split(from).length !== 2) fail(`unsupported ${description}; expected one ${JSON.stringify(from)}`);
  return value.replace(from, to);
}
function inventory(root: string, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, inventory(root, file));
    else if (entry.isFile()) result[file] = hash(readFileSync(path.join(root, file)));
    else fail(`generated path must be regular: ${file}`);
  }
  return result;
}

function compositionInputs(options: AndroidCompositionOptions, platform: 'android' | 'ios') {
  const artifact = realpathSync(options.artifactsDir), renderer = realpathSync(options.rendererDir);
  const bundle = realpathSync(options.bundleFile), sdk = realpathSync(__dirname);
  const requestedOutput = path.resolve(options.outputDir);
  // Canonicalize the parent before checking aliases and before any output mutation.
  const output = path.join(realpathSync(path.dirname(requestedOutput)), path.basename(requestedOutput));
  const overlaps = (a: string, b: string) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  if ([artifact, sdk].some(input => overlaps(output, input)) || [renderer, bundle].some(input => input === output || input.startsWith(output + path.sep)))
    fail('output must be separate from the artifact and SDK, and must not contain the renderer or bundle');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.moduleName)) fail('moduleName must be an AppRegistry identifier');
  const manifest = readRetainedArtifacts(artifact);
  if (manifest.platform !== platform) fail(`requires an ${platform} format 2 artifact`);
  const requireRenderer = createRequire(path.join(renderer, 'package.json'));
  const rn = realpathSync(path.dirname(requireRenderer.resolve('react-native/package.json')));
  const codegen = realpathSync(path.dirname(createRequire(path.join(rn, 'package.json')).resolve('@react-native/codegen/package.json')));
  if ([rn, codegen].some(dir => JSON.parse(read(dir, 'package.json')).version !== '0.86.3')) fail('React Native and codegen must both be 0.86.3');
  return { options, artifact, renderer, bundle, sdk, output, manifest, rn, codegen, bundled: readFileSync(bundle) };
}

function publishComposition(context: ReturnType<typeof compositionInputs>, metadata: Record<string, string>, generate: (stage: string) => void) {
  const { options, artifact, bundle, bundled, output, manifest } = context;
  const receiptPath = 'tauri-native-composition.json';
  let previous: { files: Record<string, string> } | undefined;
  if (existsSync(output)) {
    if (!lstatSync(output).isDirectory() || !existsSync(path.join(output, receiptPath)) || !lstatSync(path.join(output, receiptPath)).isFile()) fail('existing output is not an owned composition directory');
    const value = JSON.parse(read(output, receiptPath));
    if (value.formatVersion !== 1 || value.renderer !== 'react-native' || (value.platform ?? 'android') !== manifest.platform || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) fail('invalid prior composition receipt');
    previous = value;
    for (const [file, digest] of Object.entries(previous!.files)) {
      if (!file || file.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\0]/.test(file) || !/^[a-f0-9]{64}$/.test(digest)) fail('invalid prior composition file receipt');
      const target = path.join(output, file);
      // Check ancestors as well: never follow a replaced directory into unrelated files.
      let cursor = output;
      for (const part of file.split('/')) { cursor = path.join(cursor, part); if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${file}`); }
      if (!lstatSync(target).isFile() || hash(readFileSync(target)) !== digest) fail(`generated file changed: ${file}; preserve the edit before regenerating`);
    }
  }
  const work = mkdtempSync(path.join(path.dirname(output), '.tauri-react-compose-'));
  const stage = path.join(work, 'next');
  const backup = path.join(work, 'previous');
  let published = false;
  try {
    mkdirSync(stage); cpSync(path.join(artifact, manifest.platform), path.join(stage, manifest.platform), { recursive: true });
    generate(stage);
    const files = inventory(stage);
    const receipt = JSON.stringify({ formatVersion: 1, renderer: 'react-native', artifact: hash(readFileSync(path.join(artifact, 'manifest.json'))), moduleName: options.moduleName, ...metadata, files }, null, 2) + '\n';
    write(stage, receiptPath, receipt);
    // Revalidate inputs before publication. A changed export can never produce a partial consumer.
    if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !readFileSync(bundle).equals(bundled)) fail('inputs changed during composition');
    if (previous && read(output, receiptPath) === receipt) return false;
    if (previous) {
      // Preserve build outputs and unrelated consumer files; refuse collisions with newly generated files.
      const merged = path.join(work, 'merged'); cpSync(output, merged, { recursive: true });
      for (const file of Object.keys(previous.files)) rmSync(path.join(merged, file));
      rmSync(path.join(merged, receiptPath));
      for (const file of Object.keys(files)) {
        let cursor = merged;
        for (const part of file.split('/')) {
          cursor = path.join(cursor, part);
          let entry;
          try { entry = lstatSync(cursor); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
          if (entry.isSymbolicLink() || !entry.isDirectory()) fail(`new generated file conflicts with consumer file: ${file}`);
        }
      }
      cpSync(stage, merged, { recursive: true }); rmSync(stage, { recursive: true }); renameSync(merged, stage);
      renameSync(output, backup);
      try { renameSync(stage, output); }
      catch (error) {
        try { renameSync(backup, output); }
        catch (restoreError) { throw new AggregateError([error, restoreError], `Composition replacement and rollback failed; previous output preserved at ${backup}`); }
        throw error;
      }
    } else renameSync(stage, output);
    published = true;
    return true;
  } finally {
    // A failed rollback must never erase the only remaining copy of the previous consumer.
    if (published || !existsSync(backup)) rmSync(work, { recursive: true, force: true });
  }
}

/** The output owns generated integration; the original artifact is never modified. */
export function composeAndroid(options: AndroidCompositionOptions) {
  const context = compositionInputs(options, 'android');
  const { artifact, sdk, output, manifest, rn, codegen, bundled } = context;
  if (manifest.platform !== 'android') fail('requires an Android format 2 artifact');
  const android = path.join(artifact, 'android');
  const appId = manifest.bootstrap.applicationId, activity = `${appId}.TauriNativeActivity`;
  const source = `app/src/main/java/${appId.replaceAll('.', '/')}/MainActivity.kt`;
  const main = read(android, source);
  // Preserve upstream startup, including enableEdgeToEdge. Custom Activities need their own composition evidence.
  const normalized = main.replace(/\s+/g, ' ').trim();
  const standard = `package ${appId} import android.os.Bundle import androidx.activity.enableEdgeToEdge class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }`;
  if (normalized !== standard) fail('custom MainActivity requires verified lifecycle integration; original source was left unchanged');
  const rootGradle = read(android, 'build.gradle.kts');
  if (!rootGradle.includes('com.android.tools.build:gradle:8.11.0')) fail('requires the verified AGP 8.11.0 build');
  const updatedRoot = replaceOnce(rootGradle, 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25', 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20', 'root Kotlin dependency');
  const appGradle = read(android, 'app/build.gradle.kts');
  const settings = read(android, 'settings.gradle');
  const properties = read(android, 'gradle.properties');
  const xml = read(android, 'app/src/main/AndroidManifest.xml');
  if (/<application\b[^>]*android:name\s*=/.test(xml) || (xml.match(/<activity\b/g) ?? []).length !== 1 || /<activity-alias\b/.test(xml)) fail('custom Application or multiple Activity owners require verified integration');
  if ([rootGradle, appGradle, settings, properties, xml].some(value => /tauri-native-react|tauri-native-runtime-client|tauriNativeReact|com\.facebook\.react|expo\.modules|android\.lint\.useK2Uast/.test(value))) fail('existing renderer or lint configuration conflicts with retained composition');
  if (existsSync(path.join(android, 'tauri-native-runtime-client'))) fail('artifact already owns the generated runtime client project');
  if (!/compileSdk\s*=\s*36\b/.test(appGradle)) fail('requires the verified Android compile SDK 36 build');
  const nativeActivity = replaceOnce(xml, 'android:name=".MainActivity"', `android:name="${activity}"`, 'launcher Activity');
  const relative = (directory: string) => path.relative(path.join(output, 'android'), directory).split(path.sep).join('/');
  const template = read(sdk, 'retained/android/TauriNativeActivity.kt.template');
  const changed = publishComposition(context, { activity }, stage => {
    write(stage, `android/${source}`, replaceOnce(main, 'class MainActivity', 'open class MainActivity', 'original Activity'));
    const generated = `android/app/src/main/java/${appId.replaceAll('.', '/')}/TauriNativeActivity.kt`;
    if (existsSync(path.join(stage, generated))) fail('artifact already owns TauriNativeActivity');
    write(stage, generated, template.replaceAll('__APPLICATION_ID__', appId).replaceAll('__MODULE__', kotlin(options.moduleName)));
    write(stage, 'android/app/src/main/AndroidManifest.xml', nativeActivity);
    write(stage, 'android/build.gradle.kts', updatedRoot + `\nextra["tauriNativeReactNativeDir"] = file(${kotlin(relative(rn))}).canonicalPath\nextra["tauriNativeReactCodegenDir"] = file(${kotlin(relative(codegen))}).canonicalPath\nextra["tauriNativeNode"] = ${kotlin(process.execPath)}\nextra["tauriNativeAbis"] = listOf(${manifest.native.map(slice => kotlin(slice.abi)).join(', ')})\n`);
    write(stage, 'android/settings.gradle', settings + `\ninclude ':tauri-native-runtime-client', ':tauri-native-react'\nproject(':tauri-native-react').projectDir = new File(settingsDir, ${groovy(relative(path.join(sdk, 'android/retained')))})\n`);
    write(stage, 'android/gradle.properties', properties + '\nandroid.lint.useK2Uast=false\n');
    write(stage, 'android/app/build.gradle.kts', appGradle + `\nandroid { packaging { jniLibs.pickFirsts += "**/libc++_shared.so" }; defaultConfig { ndk { abiFilters += listOf(${manifest.native.map(slice => kotlin(slice.abi)).join(', ')}) } } }\ndependencies { implementation(project(":tauri-native-react")); implementation(project(":tauri-native-runtime-client")) }\n`);
    const client = 'app/src/main/java/dev/taurinative/runtime/RuntimeSession.java';
    write(stage, 'android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java', read(android, client));
    rmSync(path.join(stage, 'android', client));
    write(stage, 'android/tauri-native-runtime-client/build.gradle', "plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 36\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n");
    if (existsSync(path.join(stage, 'android/app/src/main/assets/tauri-native-react'))) fail('artifact already owns renderer assets');
    write(stage, 'android/app/src/main/assets/tauri-native-react/index.bundle.js', bundled);
  });
  return { project: path.join(output, 'android'), activity, changed };
}

type XcodeObject = {
  isa: string; name?: string; path?: string; sourceTree?: string; productType?: string;
  children?: string[]; files?: string[]; fileRef?: string; buildPhases?: string[];
  buildConfigurationList?: string; buildConfigurations?: string[]; mainGroup?: string;
  buildSettings?: Record<string, unknown>;
};
function plist(file: string) {
  const result = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`cannot read Apple project metadata: ${file}: ${result.error ?? result.stderr}`);
  return JSON.parse(result.stdout);
}
const ruby = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
function iosVersion(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) fail('iOS deployment targets must be explicit numeric versions');
  return value;
}
function greaterVersion(a: string, b: string) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0) ? a : b;
  return a;
}

/** Use the original Tauri Xcode app and Apple plist tools; neither export nor build Rust. */
export function composeIos(options: IosCompositionOptions) {
  if (process.platform !== 'darwin') fail('iOS composition requires macOS Apple project tools');
  const context = compositionInputs(options, 'ios');
  const { artifact, sdk, output, manifest, rn, renderer, bundled } = context;
  if (manifest.platform !== 'ios') fail('requires an iOS format 2 artifact');
  const ios = path.join(artifact, 'ios'), bootstrap = manifest.bootstrap;
  if (['Podfile', 'Podfile.lock', 'Pods', '.xcode.env', '.xcode.env.local', 'assets/tauri-native-react'].some(file => existsSync(path.join(ios, file))))
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
  const originalMain = read(ios, main);
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
  let minimumOsVersion = greaterVersion('16.4', iosVersion(bootstrap.minimumOsVersion));
  for (const item of Object.values(objects)) {
    const value = item.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET;
    if (value !== undefined) minimumOsVersion = greaterVersion(minimumOsVersion, iosVersion(value));
  }
  for (const item of Object.values(objects)) if (item.isa === 'XCBuildConfiguration' && item.buildSettings)
    item.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = minimumOsVersion;
  const encodedProject = spawnSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(project), encoding: 'utf8' });
  if (encodedProject.status !== 0) fail(`cannot encode the composed Xcode project: ${encodedProject.stderr}`);
  const relative = (dir: string) => path.relative(path.join(output, 'ios'), dir).split(path.sep).join('/');
  const workspace = bootstrap.xcodeProject.replace(/\.xcodeproj$/, '.xcworkspace');
  const changed = publishComposition(context, { platform: 'ios', minimumOsVersion, target: bootstrap.target }, stage => {
    write(stage, `ios/${projectFile}`, encodedProject.stdout);
    write(stage, `ios/${main}`, '#import <TauriNativeReactRetained/TNReactComposition.h>\n' + originalMain.replace('ffi::start_app();',
      `@autoreleasepool {\n\t\tNSURL *bundle = [NSBundle.mainBundle URLForResource:@"index.bundle" withExtension:@"js" subdirectory:@"assets/tauri-native-react"];\n\t\t[TNReactComposition installWithModule:@${JSON.stringify(options.moduleName)} bundle:bundle];\n\t}\n\tffi::start_app();`));
    write(stage, 'ios/assets/tauri-native-react/index.bundle.js', bundled);
    write(stage, 'ios/.xcode.env', `export NODE_BINARY=${shell(process.execPath)}\n`);
    write(stage, 'ios/.xcode.env.local', `export NODE_BINARY=${shell(process.execPath)}\n`);
    write(stage, 'ios/Podfile', `ENV['RCT_USE_RN_DEP'] = '1'
ENV['RCT_USE_PREBUILT_RNCORE'] = '1'
rn = File.expand_path(${ruby(relative(rn))}, __dir__)
require_relative ${ruby(relative(path.join(sdk, 'ios/retained/pods')))}
composition = TauriNativeReactRetained.composition_receipt(__dir__)
require File.join(rn, 'scripts/react_native_pods')
platform :ios, ${ruby(minimumOsVersion)}
prepare_react_native_project!
TauriNativeReactRetained.prepare(rn, ${ruby(process.execPath)})
project ${ruby(bootstrap.xcodeProject)}, 'debug' => :debug, 'release' => :release
target ${ruby(bootstrap.target)} do
  use_react_native!(:path => rn, :app_path => File.expand_path(${ruby(relative(renderer))}, __dir__))
  pod 'TauriNativeReactRetained', :path => ${ruby(relative(path.join(sdk, 'ios')))}
end
post_install do |installer|
  react_native_post_install(installer, rn, :mac_catalyst_enabled => false)
  TauriNativeReactRetained.post_install(installer, ${ruby(bootstrap.target)})
end
post_integrate do |installer|
  TauriNativeReactRetained.finish_composition(__dir__, composition)
end
`);
  });
  return { project: path.join(output, 'ios'), target: bootstrap.target, workspace, minimumOsVersion, changed };
}
