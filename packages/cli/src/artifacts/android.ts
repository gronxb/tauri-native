import { readFileSync } from 'node:fs';
import path from 'node:path';
import { commandOutput } from '../discovery/native-tool.ts';
import { validateArtifactManifest, type AndroidArtifacts } from './manifest.ts';

export interface AndroidTools { bin: string; readelf: string; systemLibraries: string }

export function androidTools(readOnly = false): AndroidTools {
  // Use cargo-ndk's own selection, including its supported NDK/SDK environment
  // variables. Never evaluate the shell exports from ndk-env.
  const environment = JSON.parse(commandOutput('cargo', ['ndk-env', '--json', '--target', 'arm64-v8a', '--platform', '24'], undefined, readOnly)) as Record<string, string>;
  if (!environment.CLANG_PATH) throw new Error('cargo ndk-env did not report its NDK compiler');
  const bin = path.dirname(environment.CLANG_PATH);
  return { bin, readelf: path.join(bin, `llvm-readelf${process.platform === 'win32' ? '.exe' : ''}`), systemLibraries: path.resolve(bin, '../../../../../meta/system_libs.json') };
}

const machines = { 'arm64-v8a': ['ELF64', 'AArch64'], 'armeabi-v7a': ['ELF32', 'ARM'], x86: ['ELF32', 'Intel 80386'], x86_64: ['ELF64', 'Advanced Micro Devices X86-64'] } as const;

export function validateAndroidArtifacts(directory: string, tools: AndroidTools): void {
  const manifest = validateArtifactManifest(directory);
  if (manifest.platform !== 'android') throw new Error('Expected Android artifacts');
  const systemLibraries = JSON.parse(readFileSync(tools.systemLibraries, 'utf8')) as Record<string, string>;
  for (const slice of manifest.native) {
    const output = commandOutput(tools.readelf, ['--file-header', '--program-headers', '--notes', '--dynamic', '--dyn-symbols', path.join(directory, slice.path)]);
    validateAndroidElf(output, slice.abi, manifest.abiVersion, systemLibraries);
  }
  if (manifest.header && !new RegExp(`^#define TAURI_NATIVE_ABI_VERSION ${manifest.abiVersion}\\b`, 'm').test(readFileSync(path.join(directory, manifest.header), 'utf8'))) throw new Error('Incompatible generated ABI header');
}

export function validateAndroidElf(output: string, abi: AndroidArtifacts['native'][number]['abi'], abiVersion: number, systemLibraries: Record<string, string>): void {
  const [elfClass, machine] = machines[abi];
  const field = (name: string) => output.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  if (field('Class') !== elfClass || field('Machine') !== machine || !field('Type')?.startsWith('DYN ') || !field('Data')?.includes('little endian')) throw new Error(`Incorrect Android ELF architecture: ${abi}`);
  const loads = output.split('\n').filter(line => /^\s*LOAD\s/.test(line));
  if (!loads.length) throw new Error(`No ELF load segments: ${abi}`);
  for (const line of loads) {
    const values = line.trim().split(/\s+/);
    const offset = BigInt(values[1]!); const address = BigInt(values[2]!); const alignment = BigInt(values.at(-1)!);
    if (alignment < 16384n || (address - offset) % 16384n !== 0n) throw new Error(`Android ELF is not 16 KB aligned: ${abi}`);
  }
  const note = output.match(/NT_ANDROID_TYPE_IDENT\s*\n\s*description data: ((?:[a-f\d]{2} ){3}[a-f\d]{2})/i)?.[1];
  if (!note || Buffer.from(note.replaceAll(' ', ''), 'hex').readUInt32LE(0) !== 24) throw new Error(`Expected Android API 24 ELF identification: ${abi}`);
  for (const symbol of ['tauri_native_invoke', 'tauri_native_string_free', ...(abiVersion !== 0 ? ['tauri_native_abi_version'] : []), ...(abiVersion === 2 ? ['create', 'start', 'poll', 'cancel', 'destroy'].map(name => `tauri_native_session_${name}`) : [])]) {
    if (!new RegExp(`\\bFUNC\\s+GLOBAL\\s+DEFAULT\\s+\\d+\\s+${symbol}\\s*$`, 'm').test(output)) throw new Error(`Missing ${symbol} in ${abi}`);
  }
  if (!/\(SONAME\)\s+Library soname: \[libtauri_native_core\.so\]/.test(output)) throw new Error(`Incorrect Android library SONAME: ${abi}`);
  for (const dependency of output.matchAll(/\(NEEDED\)\s+Shared library: \[([^\]]+)\]/g)) {
    if (systemLibraries[dependency[1]!] === undefined || Number(systemLibraries[dependency[1]!]) > 24) throw new Error(`Unbundled or unavailable Android dependency in ${abi}: ${dependency[1]}`);
  }
}
