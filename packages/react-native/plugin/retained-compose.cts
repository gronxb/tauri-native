import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readRetainedArtifacts } from '../../../scripts/retained-artifacts.ts';
import type { AndroidCompositionOptions } from './retained-compose-types.d.cts';

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

/** The output owns generated integration; the original artifact is never modified. */
export function composeAndroid(options: AndroidCompositionOptions) {
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
  if (manifest.platform !== 'android') fail('requires an Android format 2 artifact');
  const requireRenderer = createRequire(path.join(renderer, 'package.json'));
  const rn = realpathSync(path.dirname(requireRenderer.resolve('react-native/package.json')));
  const codegen = realpathSync(path.dirname(createRequire(path.join(rn, 'package.json')).resolve('@react-native/codegen/package.json')));
  if ([rn, codegen].some(dir => JSON.parse(read(dir, 'package.json')).version !== '0.86.3')) fail('React Native and codegen must both be 0.86.3');
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
  const bundled = readFileSync(bundle);
  const receiptPath = 'tauri-native-composition.json';
  let previous: { files: Record<string, string> } | undefined;
  if (existsSync(output)) {
    if (!lstatSync(output).isDirectory() || !existsSync(path.join(output, receiptPath)) || !lstatSync(path.join(output, receiptPath)).isFile()) fail('existing output is not an owned composition directory');
    const value = JSON.parse(read(output, receiptPath));
    if (value.formatVersion !== 1 || value.renderer !== 'react-native' || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) fail('invalid prior composition receipt');
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
    mkdirSync(stage); cpSync(android, path.join(stage, 'android'), { recursive: true });
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
    const files = inventory(stage);
    const receipt = JSON.stringify({ formatVersion: 1, renderer: 'react-native', artifact: hash(readFileSync(path.join(artifact, 'manifest.json'))), moduleName: options.moduleName, activity, files }, null, 2) + '\n';
    write(stage, receiptPath, receipt);
    // Revalidate inputs before publication. A changed export can never produce a partial consumer.
    if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !readFileSync(bundle).equals(bundled)) fail('inputs changed during composition');
    if (previous && read(output, receiptPath) === receipt) return { project: path.join(output, 'android'), activity, changed: false };
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
    return { project: path.join(output, 'android'), activity, changed: true };
  } finally {
    // A failed rollback must never erase the only remaining copy of the previous consumer.
    if (published || !existsSync(backup)) rmSync(work, { recursive: true, force: true });
  }
}
