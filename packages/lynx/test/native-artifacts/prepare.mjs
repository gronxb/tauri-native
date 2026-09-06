import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [host, ios, android] = process.argv.slice(2).map(value => path.resolve(value));
assert(host && ios && android, 'Usage: node prepare.mjs HOST COPIED_IOS COPIED_ANDROID');
const require = createRequire(path.join(host, 'package.json'));
const { readArtifacts } = require('@tauri-native/lynx/artifacts');
readArtifacts(ios, 'ios');
readArtifacts(android, 'android');
assert(!existsSync(path.join(host, 'tauri-native')), 'Use a fresh host without received artifacts');
const project = path.join(host, 'ios/Hello-Lynx.xcodeproj/project.pbxproj');
const gradle = path.join(host, 'android/app/build.gradle');
const xcode = readFileSync(project, 'utf8');
const build = readFileSync(gradle, 'utf8');
assert(xcode.includes('dev.tauri-native.lynx-example'), 'Use a fresh Lynx example');
assert(build.includes("applicationId 'dev.taurinative.lynxexample'") && !build.includes('signingConfig signingConfigs.debug'), 'Use a fresh Android example');
mkdirSync(path.join(host, 'tauri-native'));
cpSync(ios, path.join(host, 'tauri-native/ios'), { recursive: true });
cpSync(android, path.join(host, 'tauri-native/android'), { recursive: true });
writeFileSync(project, xcode.replaceAll('dev.tauri-native.lynx-example', 'dev.taurinative.lynxartifacttest'));
writeFileSync(gradle, build
  .replace("applicationId 'dev.taurinative.lynxexample'", "applicationId 'dev.taurinative.lynxartifacttest'")
  .replace('release {', 'release {\n      signingConfig signingConfigs.debug'));
cpSync(new URL('./App.tsx', import.meta.url), path.join(host, 'src/App.tsx'));
console.log(`Prepared independent Lynx host: ${host}`);
