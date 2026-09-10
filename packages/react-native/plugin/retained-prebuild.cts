import { execFileSync } from 'node:child_process';
import { cpSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { composeAndroid, composeIos } from './retained-compose.cts';
import { expoTools, retainedInput, type Platform, type RetainedExpoOptions } from './retained-expo-config.cts';
import { digest, fail, inventory, plist, prepareAndroidTemplate, prepareIosTemplate, read, write } from './retained-expo-template.cts';

const receiptFile = 'tauri-native-composition.json';
type Receipt = { formatVersion: number; renderer: string; platform?: Platform; layout?: string; cng?: number; files: Record<string, string>; [key: string]: unknown };
function previousReceipt(project: string, platform: Platform): Receipt | undefined {
  if (!existsSync(project)) return;
  if (lstatSync(project).isSymbolicLink() || !lstatSync(project).isDirectory()) fail('native output must be an owned regular directory');
  const file = path.join(project, receiptFile);
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) fail('native directory has no owned retained composition receipt');
  const r = JSON.parse(readFileSync(file, 'utf8')) as Receipt;
  if (r.formatVersion !== 1 || r.renderer !== 'react-native' || (r.platform ?? 'android') !== platform || r.layout !== 'native-project' ||
      !r.files || typeof r.files !== 'object' || Array.isArray(r.files)) fail('invalid prior composition receipt');
  for (const [name, hash] of Object.entries(r.files)) {
    if (!name || name.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\0]/.test(name) || !/^[a-f0-9]{64}$/.test(hash)) fail('invalid prior file receipt');
    let cursor = project;
    for (const part of name.split('/')) { cursor = path.join(cursor, part); if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${name}`); }
    if (!lstatSync(cursor).isFile() || digest(readFileSync(cursor)) !== hash) fail(`generated file changed: ${name}; preserve the edit before regenerating`);
  }
  return r;
}
function contains(original: any, actual: any): boolean {
  if (Array.isArray(original)) return Array.isArray(actual) && original.every(v => actual.some(candidate => contains(v, candidate)));
  if (original && typeof original === 'object') return actual && typeof actual === 'object' && Object.entries(original).every(([k, v]) => contains(v, actual[k]));
  return original === actual;
}
function preserve(original: any, actual: any, description: string) {
  if (!contains(original, actual)) fail(`config plugin removed or changed ${description}`);
}
async function validateNative(template: string, project: string, platform: Platform, tools: ReturnType<typeof expoTools>) {
  for (const [file, hash] of Object.entries(inventory(template))) {
    if (file === receiptFile) continue;
    const mutable = platform === 'android' ? file === 'app/src/main/AndroidManifest.xml' || file === 'gradle.properties' || file.startsWith('app/src/main/res/') : !file.includes('.xcframework/') && (/^[^/]+\/(?:Info\.plist|[^/]+\.entitlements|Supporting\/Expo\.plist)$/.test(file) || /^[^/]+\.xcodeproj\/project\.pbxproj$/.test(file) || file.includes('/Images.xcassets/'));
    if (!mutable && (!existsSync(path.join(project, file)) || digest(readFileSync(path.join(project, file))) !== hash)) fail(`config plugin changed retained native owner/input: ${file}`);
  }
  if (platform === 'android') {
    const properties = (root: string) => Object.fromEntries(read(root, 'gradle.properties').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
      const at = line.indexOf('='); if (at < 1) fail('unsupported Gradle property syntax'); return [line.slice(0, at), line.slice(at + 1)];
    }));
    const originalProperties = properties(template), generatedProperties = properties(project);
    preserve(originalProperties, generatedProperties, 'original Gradle properties');
    for (const [key, value] of Object.entries(generatedProperties)) if (!(key in originalProperties) && !(key === 'expo.inlineModules.watchedDirectories' && value === '[]')) fail(`Gradle property ${key} requires verified retained integration`);
    const manifest = 'app/src/main/AndroidManifest.xml';
    const before = (await tools.plugins.AndroidConfig.Manifest.readAndroidManifestAsync(path.join(template, manifest))).manifest;
    const after = (await tools.plugins.AndroidConfig.Manifest.readAndroidManifestAsync(path.join(project, manifest))).manifest;
    preserve(before['uses-permission'] ?? [], after['uses-permission'] ?? [], 'original Android permissions');
    preserve(before.$, after.$, 'original Android manifest identity');
    const oldApp = before.application![0]!, app = after.application![0]!;
    preserve({ 'android:name': oldApp.$['android:name'] }, app.$, 'Tauri Application');
    preserve((oldApp as any).provider ?? [], (app as any).provider ?? [], 'original Android providers');
    preserve(oldApp['meta-data'] ?? [], app['meta-data'] ?? [], 'original Android metadata');
    const oldActivity = oldApp.activity![0]!, activity = app.activity?.find(a => a.$['android:name'] === '.MainActivity');
    if (!activity) fail('config plugin replaced the retained launcher Activity');
    for (const key of ['android:name', 'android:launchMode', 'android:exported', 'android:configChanges'] as const) preserve(oldActivity.$[key], activity.$[key], `original Activity ${key}`);
    preserve(oldActivity['intent-filter'] ?? [], activity['intent-filter'] ?? [], 'original Android intent registrations');
  } else {
    const file = readdirSync(template).filter(f => f.endsWith('.xcodeproj'));
    if (file.length !== 1) fail('expected one Tauri Xcode project');
    const before = plist(path.join(template, file[0]!, 'project.pbxproj'));
    const after = plist(path.join(project, file[0]!, 'project.pbxproj'));
    preserve(before.rootObject, after.rootObject, 'original Xcode project');
    for (const [id, source] of Object.entries<any>(before.objects)) {
      const expected = structuredClone(source);
      if (expected.isa === 'XCBuildConfiguration') {
        // Expo may name the product and change supported device families. Original executable inputs remain linked.
        for (const field of ['PRODUCT_NAME', 'TARGETED_DEVICE_FAMILY', 'DEVELOPMENT_TEAM', 'CURRENT_PROJECT_VERSION', 'MARKETING_VERSION']) delete expected.buildSettings?.[field];
        if (source.buildSettings?.CODE_SIGN_ENTITLEMENTS) {
          const name = source.buildSettings.CODE_SIGN_ENTITLEMENTS;
          preserve(plist(path.join(template, name)), plist(path.join(project, name)), 'original entitlements');
        }
        if (source.buildSettings?.INFOPLIST_FILE) {
          const name = source.buildSettings.INFOPLIST_FILE, original = plist(path.join(template, name)), info = plist(path.join(project, name));
          if (info.UIApplicationSceneManifest || info.UIApplicationDelegateClassName) fail('config plugin replaced Tauri delegate/scene ownership');
          for (const key of ['CFBundleIdentifier', 'CFBundleExecutable', 'CFBundleURLTypes', 'UIRequiredDeviceCapabilities', 'UIBackgroundModes']) if (original[key] !== undefined) preserve(original[key], info[key], `original ${key}`);
          for (const [key, value] of Object.entries(original)) if (/^NS.*UsageDescription$/.test(key) && value && !info[key]) fail(`config plugin removed original permission purpose ${key}`);
        }
      }
      preserve(expected, after.objects[id], `original Xcode object ${id}`);
    }
    const properties = path.join(project, 'Podfile.properties.json');
    if (existsSync(properties)) {
      const values = JSON.parse(readFileSync(properties, 'utf8'));
      for (const [key, value] of Object.entries(values)) {
        if (key === 'expo.jsEngine' && value === 'hermes' || key === 'EX_DEV_CLIENT_NETWORK_INSPECTOR' || key === 'expo.inlineModules.watchedDirectories' && value === '[]') continue;
        if (key === 'expo.inlineModules.xcodeProjectTargets' && typeof value === 'string') {
          const inline = JSON.parse(value);
          if (Array.isArray(inline.targets) && inline.targets.length === 0) continue;
        }
        fail(`Podfile property ${key} requires verified retained CocoaPods integration`);
      }
    }
  }
}

async function packTemplate(directory: string, archive: string, tools: ReturnType<typeof expoTools>) {
  // Match Expo's installed tar reader, including long native source paths and dotfiles.
  const tar = tools.cli('multitars');
  if (tools.cli('multitars/package.json').version !== '1.0.2') fail('requires the verified Expo multitars 1.0.2 template codec');
  const files = inventory(directory);
  async function* entries() {
    for (const file of Object.keys(files)) {
      const full = path.join(directory, file), stat = lstatSync(full);
      const entry = tar.TarFile.from(Readable.toWeb(createReadStream(full)), `package/${file}`, { size: stat.size, lastModified: 0 });
      entry.mode = stat.mode & 0o777; yield entry;
    }
  }
  await pipeline(Readable.from(tar.tar(entries())), createGzip(), createWriteStream(archive));
  const actual: Record<string, string> = {};
  for await (const entry of tar.untar(createReadStream(archive).pipe(createGunzip()))) {
    if (entry.typeflag !== tar.TarTypeFlag.FILE || !entry.name.startsWith('package/')) fail('template archive contains an unexpected entry');
    const file = entry.name.slice(8);
    if (actual[file]) fail(`duplicate template entry: ${file}`);
    actual[file] = digest(Buffer.from(await entry.arrayBuffer()));
  }
  if (JSON.stringify(files) !== JSON.stringify(actual)) fail('template archive did not preserve every generated file');
}

/** Run Expo's actual custom-template prebuild with immutable retained artifacts and rollback. */
export async function prebuildRetainedExpo(options: { projectRoot?: string; platform: Platform; clean?: boolean }) {
  const root = realpathSync(options.projectRoot ?? process.cwd()), platform = options.platform;
  if (platform !== 'ios' && platform !== 'android') fail('choose platform ios or android');
  const tools = expoTools(root);
  const selected = process.env.TAURI_NATIVE_EXPO_PLATFORM;
  let config;
  try {
    process.env.TAURI_NATIVE_EXPO_PLATFORM = platform;
    config = tools.expo('@expo/config').getConfig(root).exp;
  } finally {
    if (selected === undefined) delete process.env.TAURI_NATIVE_EXPO_PLATFORM; else process.env.TAURI_NATIVE_EXPO_PLATFORM = selected;
  }
  const names = ['@tauri-native/react-native', '@tauri-native/react-native/app.plugin', '@tauri-native/react-native/app.plugin.js'];
  const entries = (config.plugins ?? []).filter((entry: any) => names.includes(Array.isArray(entry) ? entry[0] : entry));
  if (entries.length !== 1 || entries[0] !== config.plugins[0] || !Array.isArray(entries[0])) fail('declare the retained @tauri-native/react-native config plugin first, exactly once');
  const input = retainedInput(root, entries[0][1] as RetainedExpoOptions, platform);
  const project = path.join(root, platform), previous = previousReceipt(project, platform);
  for (const file of [input.artifact, input.bundle]) if (file === project || file.startsWith(project + path.sep)) fail('artifact and bundle must remain outside the native output');
  const lock = path.join(root, '.tauri-native-prebuild.lock');
  try { mkdirSync(lock); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('another retained prebuild owns .tauri-native-prebuild.lock'); throw error; }
  let work: string;
  try { work = mkdtempSync(path.join(root, '.tauri-native-prebuild-')); }
  catch (error) { rmSync(lock, { recursive: true }); throw error; }
  const backup = path.join(work, 'previous'), template = path.join(work, 'template');
  const rootFiles = new Map(readdirSync(root, { withFileTypes: true }).filter(e => e.isFile()).map(e => [e.name, readFileSync(path.join(root, e.name))]));
  let committed = false, moved = false, generated = false, ranExpo = false;
  try {
    write(lock, 'owner.json', JSON.stringify({ pid: process.pid, platform }));
    if (previous) { previousReceipt(project, platform); renameSync(project, backup); moved = true; }
    const composition = { artifactsDir: input.artifact, outputDir: project, layout: 'native-project' as const, rendererDir: root, moduleName: 'main', bundleFile: input.bundle, expo: true };
    const result = platform === 'android' ? composeAndroid(composition) : composeIos(composition);
    generated = true;
    const metadata = platform === 'android' ? prepareAndroidTemplate(project, input.manifest.bootstrap.applicationId) : prepareIosTemplate(project, (input.manifest.bootstrap as { xcodeProject: string }).xcodeProject);
    const receipt = JSON.parse(read(project, receiptFile)) as Receipt;
    Object.assign(receipt, metadata, { cng: 1 });
    receipt.files = inventory(project); delete receipt.files[receiptFile];
    write(project, receiptFile, JSON.stringify(receipt, null, 2) + '\n');
    cpSync(project, path.join(template, platform), { recursive: true });
    write(template, 'package.json', JSON.stringify({ name: 'tauri-native-expo-template', version: '1.0.0', private: true, dependencies: JSON.parse(read(root, 'package.json')).dependencies ?? {} }));
    const archive = path.join(work, 'template.tgz'); await packTemplate(template, archive, tools);
    ranExpo = true;
    const log = execFileSync(process.execPath, [tools.local.resolve('expo/bin/cli'), 'prebuild', '--clean', '--no-install', '--platform', platform, '--template', archive, '--skip-dependency-update', 'react-native,react'], {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, CI: '1', EXPO_NO_GIT_STATUS: '1', TAURI_NATIVE_EXPO_PLATFORM: platform },
    });
    await validateNative(path.join(template, platform), project, platform, tools);
    const current = retainedInput(root, entries[0][1] as RetainedExpoOptions, platform);
    if (JSON.stringify(current.manifest) !== JSON.stringify(input.manifest) || digest(readFileSync(input.bundle)) !== receipt.files[platform === 'ios' ? 'assets/tauri-native-react/index.bundle.js' : 'app/src/main/assets/tauri-native-react/index.bundle.js']) fail('artifact or bundle changed during prebuild');
    const files = inventory(project); delete files[receiptFile];
    receipt.files = files;
    write(project, receiptFile, JSON.stringify(receipt, null, 2) + '\n');
    if (moved) {
      // Keep user files, including build outputs for normal regeneration. Clean removes only known native caches.
      const restore = (prefix = '') => {
        for (const entry of readdirSync(path.join(backup, prefix), { withFileTypes: true })) {
          const file = path.posix.join(prefix, entry.name);
          if (file === receiptFile || Object.hasOwn(previous!.files, file)) continue;
          if (options.clean && /^(?:Pods|build|\.gradle|\.cxx|app\/(?:build|\.cxx))(?:\/|$)/.test(file)) continue;
          const destination = path.join(project, file);
          if (entry.isDirectory()) {
            if (existsSync(destination) && !lstatSync(destination).isDirectory()) fail(`new generated file conflicts with consumer directory: ${file}`);
            mkdirSync(destination, { recursive: true }); restore(file);
          } else {
            if (existsSync(destination)) fail(`new generated file conflicts with consumer file: ${file}`);
            // CocoaPods links can be temporarily dangling while their parent directory is in the backup.
            if (entry.isSymbolicLink()) symlinkSync(readlinkSync(path.join(backup, file)), destination);
            else if (entry.isFile()) cpSync(path.join(backup, file), destination);
            else fail(`unsupported consumer file: ${file}`);
          }
        }
      };
      restore();
    }
    committed = true;
    return { ...result, ...metadata, project, receipt, log };
  } catch (error) {
    // Restore the exact original directory, not a partially regenerated tree.
    try {
      if (generated || moved) rmSync(project, { recursive: true, force: true });
      if (moved) renameSync(backup, project);
      if (ranExpo) {
        for (const entry of readdirSync(root, { withFileTypes: true })) if (entry.isFile() && !rootFiles.has(entry.name)) rmSync(path.join(root, entry.name));
        for (const [file, bytes] of rootFiles) write(root, file, bytes);
      }
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], `Prebuild and rollback failed; inspect the previous consumer at ${existsSync(backup) ? backup : project}`);
    }
    throw error;
  } finally {
    if (committed || !existsSync(backup)) rmSync(work, { recursive: true, force: true });
    rmSync(lock, { recursive: true });
  }
}
