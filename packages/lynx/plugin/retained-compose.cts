import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepareComposition, publishComposition } from '../../../scripts/retained-composition.ts';
import type { AndroidCompositionOptions } from './retained-compose-types.d.cts';

function read(root: string, file: string) { return readFileSync(path.join(root, file), 'utf8'); }
function write(root: string, file: string, bytes: string | Buffer) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
}
const groovy = (value: string) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export function composeAndroid(options: AndroidCompositionOptions) {
  const context = prepareComposition(options, 'android', 'lynx', __dirname);
  const { artifact, sdk, output, manifest, bundled, fail } = context;
  if (manifest.platform !== 'android') return fail('requires an Android format 2 artifact');
  const android = path.join(artifact, 'android');
  const appId = manifest.bootstrap.applicationId, activity = `${appId}.TauriNativeActivity`;
  const source = `app/src/main/java/${appId.replaceAll('.', '/')}/MainActivity.kt`;
  const main = read(android, source);
  const standard = `package ${appId} import android.os.Bundle import androidx.activity.enableEdgeToEdge class MainActivity : TauriActivity() { override fun onCreate(savedInstanceState: Bundle?) { enableEdgeToEdge() super.onCreate(savedInstanceState) } }`;
  if (main.replace(/\s+/g, ' ').trim() !== standard) fail('custom MainActivity requires verified lifecycle integration; original source was left unchanged');
  const rootGradle = read(android, 'build.gradle.kts'), appGradle = read(android, 'app/build.gradle.kts');
  const settings = read(android, 'settings.gradle'), xml = read(android, 'app/src/main/AndroidManifest.xml');
  if (!rootGradle.includes('com.android.tools.build:gradle:8.11.0') || !rootGradle.includes('org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.25') || !/compileSdk\s*=\s*36\b/.test(appGradle))
    fail('requires the verified AGP 8.11.0, Kotlin 1.9.25 and compile SDK 36 build');
  if (/<application\b[^>]*android:name\s*=/.test(xml) || (xml.match(/<activity\b/g) ?? []).length !== 1 || /<activity-alias\b/.test(xml))
    fail('custom Application or multiple Activity owners require verified integration');
  if ([rootGradle, appGradle, settings, read(android, 'gradle.properties'), xml].some(value => /tauri-native-(?:react|lynx|runtime-client)|com\.facebook\.react|expo\.modules|org\.lynxsdk/.test(value)))
    fail('existing renderer configuration conflicts with retained composition');
  if (xml.split('android:name=".MainActivity"').length !== 2) fail('unsupported launcher Activity');
  const generated = `app/src/main/java/${appId.replaceAll('.', '/')}/TauriNativeActivity.kt`;
  if (['tauri-native-runtime-client', 'app/src/main/assets/tauri-native-lynx', generated].some(file => existsSync(path.join(android, file))))
    fail('artifact already owns generated Lynx integration');
  const sdkPath = path.relative(path.join(output, 'android'), path.join(sdk, 'android/retained')).split(path.sep).join('/');
  const template = read(sdk, 'retained/android/TauriNativeActivity.kt.template');
  const changed = publishComposition(context, { platform: 'android', activity }, stage => {
    write(stage, `android/${source}`, main.replace('class MainActivity', 'open class MainActivity'));
    write(stage, `android/${generated}`, template.replaceAll('__APPLICATION_ID__', appId));
    write(stage, 'android/app/src/main/AndroidManifest.xml', xml.replace('android:name=".MainActivity"', `android:name="${activity}"`));
    write(stage, 'android/settings.gradle', settings + `\ninclude ':tauri-native-runtime-client', ':tauri-native-lynx'\nproject(':tauri-native-lynx').projectDir = new File(settingsDir, ${groovy(sdkPath)})\n`);
    write(stage, 'android/app/build.gradle.kts', appGradle + `\nandroid { defaultConfig { ndk { abiFilters += listOf(${manifest.native.map(slice => JSON.stringify(slice.abi)).join(', ')}) } } }\ndependencies { implementation(project(":tauri-native-lynx")); implementation(project(":tauri-native-runtime-client")) }\n`);
    const client = 'app/src/main/java/dev/taurinative/runtime/RuntimeSession.java';
    write(stage, 'android/tauri-native-runtime-client/src/main/java/dev/taurinative/runtime/RuntimeSession.java', read(android, client));
    rmSync(path.join(stage, 'android', client));
    write(stage, 'android/tauri-native-runtime-client/build.gradle', "plugins { id 'com.android.library' }\nandroid {\n namespace 'dev.taurinative.runtime'\n compileSdk 35\n defaultConfig { minSdk 24 }\n compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n}\n");
    write(stage, 'android/app/src/main/assets/tauri-native-lynx/main.lynx.bundle', bundled);
  });
  return { project: path.join(output, 'android'), activity, changed };
}
