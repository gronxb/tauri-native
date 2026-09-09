import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { commandOutput } from '../discovery/native-tool.ts';
import { androidTools } from '../artifacts/android.ts';
import { inventory, sha256 } from '../artifacts/files.ts';
import { publishArtifacts } from '../artifacts/staging.ts';
import { run } from '../utils/process.ts';
import { message } from '../utils/output.ts';
import { generateCommands } from '../types/commands.ts';
import { prepareRuntime } from './workspace.ts';
import { copyAndroidRuntimeProject } from './android-project.ts';
import { readRetainedArtifacts, retainedAndroidAbis, type RetainedAndroidArtifact } from '../../../../scripts/retained-artifacts.ts';
import packageJson from '../../package.json' with { type: 'json' };

import { readRuntimeExport, acquireRuntimeBuild, runtimeNpmDirectory, type RetainedExportOptions } from './export-project.ts';
import { createRuntimeCache } from './cache.ts';
import { assertNativePaths, runtimeBuildEnvironment } from './paths.ts';

const rustTargets = { aarch64: 'aarch64-linux-android', armv7: 'armv7-linux-androideabi', i686: 'i686-linux-android', x86_64: 'x86_64-linux-android' } as const;
const roots = new Set(['manifest.json', 'build.json', 'commands.json', 'commands.ts', 'callers.json', 'include', 'android']);

export function exportRetainedAndroid(options: RetainedExportOptions): void {
  const { project, output, config, applicationId, policy, plugins } = readRuntimeExport(options, 'android');
  const targets = (options.targets ?? Object.keys(retainedAndroidAbis).join(',')).split(',') as (keyof typeof retainedAndroidAbis)[];
  if (!targets.length || new Set(targets).size !== targets.length || targets.some(target => !Object.hasOwn(retainedAndroidAbis, target))) throw new Error('Select unique retained Android --targets from aarch64,armv7,i686,x86_64.');
  if (!/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+$/.test(applicationId)) throw new Error('Retained Android export requires a Java-compatible Tauri identifier.');
  if (config.bundle?.android?.minSdkVersion != null && config.bundle.android.minSdkVersion !== 24) throw new Error('Retained Android export currently verifies API 24 native libraries.');
  const release = acquireRuntimeBuild(applicationId);
  let runtime: ReturnType<typeof prepareRuntime> | undefined;
  try {
    const cache = createRuntimeCache(project, output, 'android', targets, options.debug ? 'debug' : 'release', policy);
    if (options.incremental && !options.force && cache.hit()) { cache.verify(); message(`Reused validated retained Android artifacts in ${output}`, '◆ '); return; }
    const tools = androidTools();
    publishArtifacts(output, stage => {
      runtime = prepareRuntime(project, policy, cache);
      const cwd = runtimeNpmDirectory(runtime);
      const env = runtimeBuildEnvironment(runtime, path.resolve(process.env.CARGO_TARGET_DIR ?? path.join(project.tauriDirectory, 'target/tauri-native/retained-build')), 'android');
      run('npm', ['run', 'tauri-native:runtime', '--', 'android', 'init', '--ci', '--skip-targets-install'], { cwd, env });
      // Native build.rs side effects must run for this fresh output directory.
      for (const target of targets) run('cargo', ['clean', '--package', 'tauri', ...Object.keys(plugins).flatMap(name => ['--package', name]),
        '--target', rustTargets[target], '--manifest-path', runtime.project.manifest], { cwd, env });
      run('npm', ['run', 'tauri-native:runtime', '--', 'android', 'build', '--ci', ...(options.debug ? ['--debug'] : []), '--target', ...targets, '--apk'], { cwd, env });
      const android = path.join(stage, 'android');
      const captured = copyAndroidRuntimeProject(path.join(runtime.project.tauriDirectory, 'gen/android'), android);
      if (captured.modules.slice().sort().join(',') !== ['tauri-android', ...Object.keys(plugins)].sort().join(',')) throw new Error('Resolved Rust plugins differ from generated Android native registrations.');
      const java = path.join(android, 'app/src/main/java/dev/taurinative/runtime');
      if (existsSync(java)) throw new Error('Producer already owns the generated retained runtime Java package.');
      mkdirSync(java, { recursive: true });
      cpSync(path.join(runtime.runtime, 'android/RuntimeSession.java'), path.join(java, 'RuntimeSession.java'));
      const proguard = path.join(android, 'app/proguard-tauri-native.pro');
      if (existsSync(proguard)) throw new Error('Producer conflicts with generated retained runtime JNI keep rules.');
      writeFileSync(proguard, '-keep class dev.taurinative.runtime.RuntimeSession { *; }\n');
      mkdirSync(path.join(stage, 'include'));
      cpSync(path.join(runtime.runtime, 'tauri_native_runtime.h'), path.join(stage, 'include/tauri_native_runtime.h'));
      writeFileSync(path.join(stage, 'commands.json'), JSON.stringify(runtime.model, null, 2) + '\n');
      if (runtime.model.typeGraph) writeFileSync(path.join(stage, 'commands.ts'), generateCommands(runtime.model));
      const callerBytes = JSON.stringify(policy, null, 2) + '\n';
      writeFileSync(path.join(stage, 'callers.json'), callerBytes);
      const native = targets.map(target => ({ abi: retainedAndroidAbis[target], path: `android/app/src/main/jniLibs/${retainedAndroidAbis[target]}/lib${project.libraryName}.so` }));
      for (const slice of native) {
        const library = path.join(stage, slice.path);
        run(path.join(tools.bin, `llvm-strip${process.platform === 'win32' ? '.exe' : ''}`), ['--strip-debug', library]);
        assertNativePaths(library, runtime, env.CARGO_TARGET_DIR);
      }
      const packaged = readdirSync(path.join(android, 'app/src/main/jniLibs'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.so')).map(file => `android/app/src/main/jniLibs/${file}`);
      if (packaged.sort().join(',') !== native.map(slice => slice.path).sort().join(',')) throw new Error('Unexpected or missing native Android library; every packaged ELF needs explicit validation.');
      const manifest: RetainedAndroidArtifact = { formatVersion: 2, abiVersion: 3, platform: 'android', generator: { name: '@tauri-native/cli', version: packageJson.version },
        compatibility: { mode: 'retained', tauri: '2.11.5', tauriCli: '2.11.4', wry: '0.55.1', tauriRuntimeWry: '2.11.4' }, profile: options.debug ? 'debug' : 'release',
        bootstrap: { owner: 'tauri', project: 'android', applicationId, activity: `${applicationId}.MainActivity`, minimumApiLevel: 24 }, plugins, native,
        commands: 'commands.json', callers: 'callers.json', source: { ...cache.receipt(stage), callerPolicySha256: sha256(callerBytes) }, files: inventory(stage) };
      writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    }, stage => {
      const manifest = readRetainedArtifacts(stage);
      if (manifest.platform !== 'android') throw new Error('Expected retained Android artifacts.');
      const systemLibraries = JSON.parse(readFileSync(tools.systemLibraries, 'utf8'));
      for (const slice of manifest.native) validateRetainedAndroidElf(commandOutput(tools.readelf,
        ['--file-header', '--program-headers', '--notes', '--dynamic', '--dyn-symbols', path.join(stage, slice.path)]), slice.abi, project.libraryName, systemLibraries);
      cache.verify();
    }, roots);
    message(`Created retained Tauri Android bootstrap and ABI 3 artifacts in ${output}`, '◆ ');
  } finally { try { runtime?.cleanup(); } finally { release(); } }
}

export function validateRetainedAndroidElf(output: string, abi: RetainedAndroidArtifact['native'][number]['abi'], library: string, systemLibraries: Record<string, string>) {
  const machines = { 'arm64-v8a': ['ELF64', 'AArch64'], 'armeabi-v7a': ['ELF32', 'ARM'], x86: ['ELF32', 'Intel 80386'], x86_64: ['ELF64', 'Advanced Micro Devices X86-64'] };
  const field = (name: string) => output.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  if (field('Class') !== machines[abi]![0] || field('Machine') !== machines[abi]![1] || !field('Type')?.startsWith('DYN ') || !field('Data')?.includes('little endian')) throw new Error(`Incorrect retained Android ELF architecture: ${abi}`);
  const loads = output.split('\n').filter(line => /^\s*LOAD\s/.test(line));
  if (!loads.length || loads.some(line => { const fields = line.trim().split(/\s+/); return BigInt(fields.at(-1)!) < 16384n || (BigInt(fields[2]!) - BigInt(fields[1]!)) % 16384n !== 0n; })) throw new Error(`Retained Android ELF is not 16 KB aligned: ${abi}`);
  const note = output.match(/NT_ANDROID_TYPE_IDENT\s*\n\s*description data: ((?:[a-f\d]{2} ){3}[a-f\d]{2})/i)?.[1];
  if (!note || Buffer.from(note.replaceAll(' ', ''), 'hex').readUInt32LE(0) !== 24) throw new Error(`Expected retained Android API 24: ${abi}`);
  for (const symbol of ['tauri_native_runtime_request', 'tauri_native_runtime_string_free', 'Java_dev_taurinative_runtime_RuntimeSession_request']) {
    if (!new RegExp(`\\bFUNC\\s+GLOBAL\\s+DEFAULT\\s+\\d+\\s+${symbol}\\s*$`, 'm').test(output)) throw new Error(`Missing retained runtime symbol ${symbol}: ${abi}`);
  }
  // Standard Tauri loads the app by its original filename and emits no SONAME.
  const soname = output.match(/\(SONAME\)\s+Library soname: \[([^\]]+)\]/)?.[1];
  if (soname && soname !== `lib${library}.so`) throw new Error(`Incorrect retained Android SONAME: ${abi}`);
  for (const dependency of output.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)) if (systemLibraries[dependency[1]!] === undefined || Number(systemLibraries[dependency[1]!]) > 24) throw new Error(`Unbundled Android dependency: ${dependency[1]}`);
}
