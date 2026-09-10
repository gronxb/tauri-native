import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const quote = (s: string) => JSON.stringify(s).replaceAll('$', '\\$');
const groovy = (s: string) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const read = (root: string, file: string) => readFileSync(path.join(root, file), 'utf8');
function write(root: string, file: string, value: string) { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), value); }
function replace(value: string, from: string, to: string) {
  if (value.split(from).length !== 2) throw new Error(`Retained Expo composition: expected one ${JSON.stringify(from)}`);
  return value.replace(from, to);
}

/** Configure Expo in the generated Tauri consumer, without replacing its platform startup. */
export function prepareExpoAndroid(context: { sdk: string; output: string; rendererDirectory: string; rn: string; codegen: string; manifest: { bootstrap: { applicationId: string }; native: { abi: string }[] } }) {
  const { sdk, output, rendererDirectory: renderer, rn, codegen } = context;
  const appId = context.manifest.bootstrap.applicationId;
  if (!output.startsWith(renderer + path.sep)) throw new Error('Retained Expo composition: outputDir must be inside rendererDir so Expo Gradle scripts resolve the consuming app');
  const requireRenderer = createRequire(path.join(renderer, 'package.json'));
  const expo = realpathSync(requireRenderer.resolve('expo/package.json'));
  const requireExpo = createRequire(expo);
  const versions = { expo: [expo, '57.0.19'], 'expo-modules-core': [requireExpo.resolve('expo-modules-core/package.json'), '57.0.15'], 'expo-modules-autolinking': [requireExpo.resolve('expo-modules-autolinking/package.json'), '57.0.12'] };
  for (const [name, [file, version]] of Object.entries(versions)) {
    if (JSON.parse(readFileSync(file!, 'utf8')).version !== version) throw new Error(`Retained Expo composition: requires ${name} ${version}`);
  }
  const { getConfig } = requireExpo('@expo/config') as { getConfig(root: string, options: { skipPlugins: boolean }): { exp: { android?: { package?: string } } } };
  const configuredId = getConfig(renderer, { skipPlugins: true }).exp.android?.package;
  if (configuredId && configuredId !== appId) throw new Error(`Retained Expo composition: android.package ${configuredId} conflicts with the original Tauri application ${appId}`);
  const rngp = path.dirname(createRequire(path.join(rn, 'package.json')).resolve('@react-native/gradle-plugin/package.json'));
  const expoGradle = path.join(path.dirname(requireExpo.resolve('expo-modules-autolinking/package.json')), 'android/expo-gradle-plugin');
  const relative = (dir: string) => path.relative(path.join(output, 'android'), dir).split(path.sep).join('/');
  return (stage: string) => {
    const android = path.join(stage, 'android');
    const source = `app/src/main/java/${appId.replaceAll('.', '/')}/TauriNativeActivity.kt`;
    for (const file of [source.replace('TauriNativeActivity.kt', 'TauriExpoIntegration.kt'), 'app/src/main/jni/CMakeLists.txt', 'app/src/main/jni/OnLoad.cpp']) {
      if (existsSync(path.join(android, file))) throw new Error(`Retained Expo composition: artifact already owns ${file}`);
    }
    let activity = read(android, source);
    activity = replace(activity, 'open class TauriNativeActivity', '@OptIn(com.facebook.react.common.annotations.UnstableReactNativeAPI::class)\nopen class TauriNativeActivity');
    activity = replace(activity, 'private var retired = false', 'private var retired = false\n  private var expo: TauriExpoIntegration? = null');
    activity = replace(activity, 'createReactContainer(webView),', 'expo!!.createContainer(createReactContainer(webView)),');
    activity = replace(activity, 'webView, reactPermissions)', 'webView, reactPermissions, expo!!.delegate("tauri-native-react/index.bundle.js"), expo!!::prepareHost, expo!!::onBackPressed)');
    activity = replace(activity, 'reactPermissions = TauriReactPermissions(this)', 'expo = TauriExpoIntegration(this)\n    reactPermissions = TauriReactPermissions(this)');
    activity = replace(activity, 'super.onCreate(savedInstanceState)', 'super.onCreate(savedInstanceState)\n    expo!!.onCreate(savedInstanceState)');
    activity = replace(activity, 'tauriReactHost?.onResume() }', 'tauriReactHost?.onResume(); expo?.onResume() }');
    activity = replace(activity, 'override fun onPause() {', 'override fun onPause() { expo?.onPause();');
    activity = replace(activity, 'super.onNewIntent(intent);', 'super.onNewIntent(intent); expo?.onNewIntent(intent);');
    activity = replace(activity, 'retired = true;', 'expo?.onDestroy()\n    retired = true;');
    activity = replace(activity, '  override fun onDestroy() {', `  override fun onContentChanged() { super.onContentChanged(); expo?.onContentChanged() }
  override fun onUserLeaveHint() { super.onUserLeaveHint(); expo?.onUserLeaveHint() }
  override fun onKeyDown(code: Int, event: android.view.KeyEvent?): Boolean = expo?.onKeyDown(code, event) == true || super.onKeyDown(code, event)
  override fun onKeyUp(code: Int, event: android.view.KeyEvent): Boolean = expo?.onKeyUp(code, event) == true || super.onKeyUp(code, event)
  override fun onKeyLongPress(code: Int, event: android.view.KeyEvent?): Boolean = expo?.onKeyLongPress(code, event) == true || super.onKeyLongPress(code, event)
  override fun onDestroy() {`);
    write(android, source, activity);
    write(android, source.replace('TauriNativeActivity.kt', 'TauriExpoIntegration.kt'), read(sdk, 'retained/android/TauriExpoIntegration.kt.template').replaceAll('__APPLICATION_ID__', appId));
    write(android, 'app/src/main/AndroidManifest.xml', replace(read(android, 'app/src/main/AndroidManifest.xml'), '<application', `<application android:name="${appId}.TauriNativeApplication"`));
    write(android, 'settings.gradle', `pluginManagement {
  includeBuild(new File(settingsDir, ${groovy(relative(rngp))}).canonicalPath)
  includeBuild(new File(settingsDir, ${groovy(relative(expoGradle))}).canonicalPath)
}
plugins { id 'com.facebook.react.settings'; id 'expo-autolinking-settings' }
expoAutolinking.projectRoot = new File(settingsDir, ${groovy(relative(renderer))}).canonicalFile
expoAutolinking.exclude = ['@tauri-native/react-native']
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand + ['--exclude', '@tauri-native/react-native'], expoAutolinking.projectRoot,
    files(new File(expoAutolinking.projectRoot, 'package.json'), new File(expoAutolinking.projectRoot, 'pnpm-lock.yaml'), new File(expoAutolinking.projectRoot, 'package-lock.json'), new File(expoAutolinking.projectRoot, 'react-native.config.js'), new File(settingsDir, 'settings.gradle')))
}
expoAutolinking.useExpoModules()
expoAutolinking.useExpoVersionCatalog()
${read(android, 'settings.gradle')}
includeBuild(new File(settingsDir, ${groovy(relative(rngp))}))
`);
    let root = read(android, 'build.gradle.kts');
    root = replace(root, 'com.android.tools.build:gradle:8.11.0', 'com.android.tools.build:gradle:8.12.0');
    root = replace(root, 'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")', 'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")\n        classpath("com.facebook.react:react-native-gradle-plugin")');
    write(android, 'build.gradle.kts', root + `
extra["tauriNativeAutolinking"] = true
// Keep original Tauri projects' paired Java/Kotlin targets. RN 0.86 otherwise changes only their Java target to 17.
subprojects {
  if (projectDir.toPath().startsWith(rootProject.file("native-dependencies").toPath())) {
    extra["react.internal.disableJavaVersionAlignment"] = true
  }
}
apply(plugin = "expo-root-project")
apply(plugin = "com.facebook.react.rootproject")
`);
    let app = read(android, 'app/build.gradle.kts');
    app = replace(app, 'id("org.jetbrains.kotlin.android")', 'id("org.jetbrains.kotlin.android")\n    id("com.facebook.react")');
    app = replace(app, 'jvmTarget = "1.8"', 'jvmTarget = "17"');
    app += `
react {
  root.set(rootProject.file(${quote(relative(renderer))}))
  reactNativeDir.set(rootProject.file(${quote(relative(rn))}))
  codegenDir.set(rootProject.file(${quote(relative(codegen))}))
  nodeExecutableAndArgs.set(listOf(${quote(process.execPath)}))
  // Composition already copied the caller's offline bundle. This does not change Android debuggability.
  debuggableVariants.set(listOf("debug", "release"))
  autolinkLibrariesWithApp()
}
android {
  ndkVersion = "27.1.12297006"
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  externalNativeBuild { cmake { path = file("src/main/jni/CMakeLists.txt"); version = "3.22.1" } }
  defaultConfig { externalNativeBuild { cmake { arguments += "-DTAURI_RETAINED_CODEGEN=" + project(":tauri-native-react").layout.buildDirectory.dir("generated/retained-codegen").get().asFile.absolutePath } } }
}
tasks.matching { it.name.startsWith("configureCMake") }.configureEach { dependsOn(":tauri-native-react:generateRetainedCode") }
`;
    write(android, 'app/build.gradle.kts', app);
    write(android, 'gradle.properties', read(android, 'gradle.properties') + `\nnewArchEnabled=true\nhermesEnabled=true\nreactNativeArchitectures=${context.manifest.native.map(slice => slice.abi).join(',')}\n`);
    for (const file of ['CMakeLists.txt', 'OnLoad.cpp']) write(android, `app/src/main/jni/${file}`, read(sdk, `retained/android/autolinking/${file}`));
  };
}
