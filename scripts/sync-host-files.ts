import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

// Both npm packages ship these helpers without a dependency on each other or the CLI.
const [host, mode] = process.argv.slice(2);
assert(host === 'react-native' || host === 'lynx', 'Choose react-native or lynx');
assert(mode === undefined || mode === '--check', 'Only --check is supported');
const webViewClient = stripTypeScriptTypes(readFileSync(new URL('webview-client.ts', import.meta.url), 'utf8')).split('\n').map(line => line.trimEnd()).filter((line, index, lines) => line || lines[index - 1]).join('\n').trimStart();
async function compile(source: string) {
  const bundles = await build({ config: false, entry: [fileURLToPath(new URL(source, import.meta.url))], cwd: fileURLToPath(new URL('..', import.meta.url)), format: 'cjs', platform: 'node', target: 'node22', write: false, dts: false, logLevel: 'silent', clean: false });
  const chunks = bundles.flatMap(bundle => bundle.chunks);
  const chunk = chunks.find(chunk => chunk.type === 'chunk' && chunk.isEntry);
  assert(chunk?.type === 'chunk');
  return '// Generated from TypeScript by scripts/sync-host-files.ts.\n' + chunk.code;
}
const artifacts = await compile('artifacts.ts');
const retainedArtifacts = await compile('retained-artifacts.ts');
const plugin = host === 'react-native' ? await compile('../packages/react-native/plugin/app.plugin.cts') : undefined;
const compose = await compile(`../packages/${host}/plugin/retained-compose.cts`);
const client = (android: boolean) => webViewClient
  .replace("'__TAURI_NATIVE_HOST__'", JSON.stringify(host))
  .replace('__TAURI_NATIVE_POST_MESSAGE__', android
    ? 'window.TauriNativeBridge.postMessage(JSON.stringify(message))'
    : 'window.webkit.messageHandlers.tauriNative.postMessage(JSON.parse(JSON.stringify(message)))');
for (const [source, destination] of [
  ['artifacts.ts', host === 'lynx' ? 'artifacts.cjs' : 'artifacts.js'],
  ['retained-artifacts.ts', host === 'lynx' ? 'retained-artifacts.cjs' : 'retained-artifacts.js'],
  ['retained-artifacts.d.cts', 'retained-artifacts.d.ts'],
  ['retained-pods.rb', 'ios/retained/composition.rb'],
  ...(host === 'react-native' ? [['../packages/react-native/plugin/app.plugin.cts', 'app.plugin.js']] : []),
  [`../packages/${host}/plugin/retained-compose.cts`, host === 'lynx' ? 'compose.cjs' : 'compose.js'],
  [`../packages/${host}/plugin/retained-compose-types.d.cts`, 'compose.d.ts'],
  ['artifacts.d.cts', 'artifacts.d.ts'],
  ['async-client.ts', 'src/async-client.ts'],
  ['retained-client.ts', 'src/retained-client.ts'],
  ['view-options.ts', 'src/view-options.ts'],
  ['async-contract.ts', 'test/native-artifacts/async-contract.ts'],
  ['view-contract.ts', 'test/native-artifacts/view-contract.ts'],
  ['tauri-native-jni.cpp', host === 'lynx' ? 'android/src/main/cpp/TauriNativeJni.cpp' : 'android/src/main/jni/TauriNativeJni.cpp'],
  ['rust-bridge.h', host === 'lynx' ? 'ios/src/TNTauriLynxRustBridge.h' : 'ios/TNTauriRustBridge.h'],
  ['rust-bridge.mm', host === 'lynx' ? 'ios/src/TNTauriLynxRustBridge.mm' : 'ios/TNTauriRustBridge.mm'],
  ['tauri-webview.swift', host === 'lynx' ? 'ios/src/TNTauriLynxWebView.swift' : 'ios/TNTauriWebView.swift'],
  ['webview-bridge.java', host === 'lynx' ? 'android/src/main/java/dev/taurinative/lynx/TauriJavascriptBridge.java' : 'android/src/main/java/com/reactnativetauri/TauriJavascriptBridge.java'],
  ['android-view-state.java', host === 'lynx' ? 'android/src/main/java/dev/taurinative/lynx/TauriViewState.java' : 'android/src/main/java/com/reactnativetauri/TauriViewState.java'],
] as [string, string][]) {
  const contents: string = (source === 'artifacts.ts' ? artifacts : source === 'retained-artifacts.ts' ? retainedArtifacts : source.endsWith('app.plugin.cts') ? plugin! : source.endsWith('retained-compose.cts') ? compose! : readFileSync(new URL(source, import.meta.url), 'utf8'))
    .replaceAll('__TAURI_NATIVE_COMPOSITION_MODULE__', host === 'lynx' ? 'TauriNativeLynxRetained' : 'TauriNativeReactRetained')
    .replaceAll('__TAURI_NATIVE_RENDERER__', host)
    .replaceAll('__TAURI_NATIVE_JNI_CLASS__', host === 'lynx' ? 'Java_dev_taurinative_lynx_TauriNativeRust' : 'Java_com_reactnativetauri_TauriNativeRust')
    .replaceAll('__TAURI_NATIVE_OBJC_BRIDGE__', host === 'lynx' ? 'TNTauriLynxRustBridge' : 'TNTauriRustBridge')
    .replaceAll('__TAURI_NATIVE_SWIFT_VIEW__', host === 'lynx' ? 'TNTauriLynxWebView' : 'TNTauriWebView')
    .replaceAll('__TAURI_NATIVE_JAVA_PACKAGE__', host === 'lynx' ? 'dev.taurinative.lynx' : 'com.reactnativetauri')
    .replaceAll('__TAURI_NATIVE_JAVA_RUST__', host === 'lynx' ? 'TauriNativeRust' : 'TauriNativeRust.INSTANCE')
    .replace('    __TAURI_NATIVE_SCROLL_SETTINGS__\n', host === 'lynx' ? '    webView.scrollView.bounces = false\n' : '')
    .replace('__TAURI_NATIVE_WEBVIEW_CLIENT__', client(false).trimEnd().split('\n').map(line => line ? '    ' + line : '').join('\n'));
  const output = new URL(`../packages/${host}/${destination}`, import.meta.url);
  if (mode === '--check') assert.equal(readFileSync(output, 'utf8'), contents, `Run node scripts/sync-host-files.ts ${host}`);
  else writeFileSync(output, contents);
}
const androidOutput = new URL(host === 'lynx'
  ? '../packages/lynx/android/src/main/java/dev/taurinative/lynx/TauriWebView.java'
  : '../packages/react-native/android/src/main/java/com/reactnativetauri/TauriWebView.kt', import.meta.url);
const androidSource = readFileSync(androidOutput, 'utf8');
const contents = androidSource.replace(/(BRIDGE_SOURCE\s*=\s*""")[\s\S]*?(""")/, (_, start, end) =>
  start + '\n' + client(true).trimEnd().split('\n').map(line => line ? '    ' + line : '').join('\n') + '\n    ' + end);
if (mode === '--check') assert.equal(androidSource, contents, `Run node scripts/sync-host-files.ts ${host}`);
else writeFileSync(androidOutput, contents);
