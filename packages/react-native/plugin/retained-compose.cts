import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { prepareComposition, publishComposition } from '../../../scripts/retained-composition.ts';
import { prepareIosProject } from '../../../scripts/retained-ios-composition.ts';
import type { AndroidCompositionOptions, IosCompositionOptions } from './retained-compose-types.d.cts';

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
function compositionInputs(options: AndroidCompositionOptions, platform: 'android' | 'ios') {
  const context = prepareComposition(options, platform, 'react-native', __dirname);
  const renderer = realpathSync(options.rendererDir);
  if (renderer === context.output || renderer.startsWith(context.output + path.sep))
    fail('output must be separate from the artifact and SDK, and must not contain the renderer or bundle');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.moduleName)) fail('moduleName must be an AppRegistry identifier');
  const requireRenderer = createRequire(path.join(renderer, 'package.json'));
  const rn = realpathSync(path.dirname(requireRenderer.resolve('react-native/package.json')));
  const codegen = realpathSync(path.dirname(createRequire(path.join(rn, 'package.json')).resolve('@react-native/codegen/package.json')));
  if ([rn, codegen].some(dir => JSON.parse(read(dir, 'package.json')).version !== '0.86.3')) fail('React Native and codegen must both be 0.86.3');
  return { ...context, rendererDirectory: renderer, rn, codegen };
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
  const changed = publishComposition(context, { moduleName: options.moduleName, activity }, stage => {
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

const ruby = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Use the original Tauri Xcode app and Apple plist tools; neither export nor build Rust. */
export function composeIos(options: IosCompositionOptions) {
  if (process.platform !== 'darwin') fail('iOS composition requires macOS Apple project tools');
  const context = compositionInputs(options, 'ios');
  const { sdk, output, manifest, rn, rendererDirectory: renderer, bundled } = context;
  if (manifest.platform !== 'ios') fail('requires an iOS format 2 artifact');
  const { projectFile, encodedProject, main, originalMain, minimumOsVersion, bootstrap, workspace } = prepareIosProject(context, '16.4');
  const relative = (dir: string) => path.relative(path.join(output, 'ios'), dir).split(path.sep).join('/');
  const changed = publishComposition(context, { moduleName: options.moduleName, platform: 'ios', minimumOsVersion, target: bootstrap.target }, stage => {
    write(stage, `ios/${projectFile}`, encodedProject);
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
