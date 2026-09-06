import { readFileSync } from 'node:fs';
import path from 'node:path';
import { commandOutput } from '../discovery/native-tool.ts';
import { validateArtifactManifest, type IosArtifacts } from './manifest.ts';

export function iosSlices(directory: string): IosArtifacts['native'] {
  const info = JSON.parse(commandOutput('plutil', ['-convert', 'json', '-o', '-', path.join(directory, 'TauriNativeCore.xcframework/Info.plist')])) as {
    AvailableLibraries: { LibraryIdentifier: string; LibraryPath: string; SupportedPlatform: string; SupportedPlatformVariant?: string; SupportedArchitectures: string[] }[];
  };
  if (!Array.isArray(info.AvailableLibraries) || info.AvailableLibraries.length !== 2) throw new Error('XCFramework must contain device and simulator libraries');
  const slices = info.AvailableLibraries.map(library => {
    if (library.SupportedPlatform !== 'ios' || ![undefined, 'simulator'].includes(library.SupportedPlatformVariant)) throw new Error('Unexpected XCFramework platform');
    for (const component of [library.LibraryIdentifier, library.LibraryPath]) {
      if (typeof component !== 'string' || !/^[\w.-]+$/.test(component) || component === '.' || component === '..') throw new Error('Invalid XCFramework library path');
    }
    return {
      path: `TauriNativeCore.xcframework/${library.LibraryIdentifier}/${library.LibraryPath}`,
      architectures: library.SupportedArchitectures.slice().sort(),
      variant: library.SupportedPlatformVariant === 'simulator' ? 'simulator' as const : 'device' as const,
    };
  }).sort((a, b) => a.variant.localeCompare(b.variant));
  if (slices[0]!.variant !== 'device' || slices[0]!.architectures.join(',') !== 'arm64' || slices[1]!.variant !== 'simulator' || slices[1]!.architectures.join(',') !== 'arm64,x86_64') throw new Error('XCFramework is missing a required iOS architecture');
  return slices;
}

export function validateIosArtifacts(directory: string): void {
  const manifest = validateArtifactManifest(directory);
  if (manifest.platform !== 'ios') throw new Error('Expected iOS artifacts');
  const slices = iosSlices(directory);
  if (JSON.stringify(slices) !== JSON.stringify(manifest.native)) throw new Error('XCFramework slices do not match manifest');
  for (const slice of slices) {
    const library = path.join(directory, slice.path);
    const architectures = commandOutput('lipo', ['-archs', library]).trim().split(/\s+/).sort();
    if (architectures.join(',') !== slice.architectures.join(',')) throw new Error(`Incorrect binary architectures: ${slice.path}`);
    const header = readFileSync(path.join(path.dirname(library), 'Headers/tauri_native.h'), 'utf8');
    if (manifest.abiVersion !== 0 && !new RegExp(`^#define TAURI_NATIVE_ABI_VERSION ${manifest.abiVersion}\\b`, 'm').test(header)) throw new Error('Incompatible generated ABI header');
    for (const arch of architectures) {
      // Inspect linked machine-code symbols. Rust's embedded LLVM bitcode can
      // be newer than Xcode's reader and is not a host link input.
      const symbols = commandOutput('nm', ['--no-llvm-bc', '-arch', arch!, '-gU', library]);
      for (const name of ['tauri_native_invoke', 'tauri_native_string_free', ...(manifest.abiVersion !== 0 ? ['tauri_native_abi_version'] : []), ...(manifest.abiVersion === 2 ? ['create', 'start', 'poll', 'cancel', 'destroy'].map(name => `tauri_native_session_${name}`) : [])]) {
        if (!new RegExp(`\\bT _${name}\\s*$`, 'm').test(symbols)) throw new Error(`Missing ${name} in ${slice.path} (${arch})`);
      }
    }
  }
}
