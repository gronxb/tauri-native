import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';

function write(root: string, file: string, content: string) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content); }

export async function writeTestArtifacts(directory: string, platform: 'ios' | 'android', label = 'version one', legacy = false, abiVersion: 1 | 2 = 1) {
  // The real CLI writer supplies receipts to this independent host reader.
  const { ANDROID_ABIS, IOS_LAYOUT, writeArtifactManifest } = await import('../packages/cli/src/artifacts/manifest.ts');
  rmSync(directory, { recursive: true, force: true });
  const source = { rustEntrySha256: '0'.repeat(64) };
  const header = legacy ? 'void tauri_native_string_free(char *value);\n' : `#define TAURI_NATIVE_ABI_VERSION ${abiVersion}\n`;
  let metadata: Parameters<typeof writeArtifactManifest>[1];
  if (platform === 'ios') {
    const native: import('../packages/cli/src/artifacts/manifest.ts').IosArtifacts['native'] = [
      { path: 'TauriNativeCore.xcframework/ios-arm64/core.a', architectures: ['arm64'], variant: 'device' },
      { path: 'TauriNativeCore.xcframework/ios-arm64_x86_64-simulator/core.a', architectures: ['arm64', 'x86_64'], variant: 'simulator' },
    ];
    for (const slice of native) {
      write(directory, slice.path, `${label} ${slice.variant}`);
      write(directory, path.posix.join(path.posix.dirname(slice.path), 'Headers/tauri_native.h'), header);
    }
    write(directory, 'TauriNativeCore.xcframework/Info.plist', 'fixture framework metadata');
    write(directory, 'TauriNativeAssets.bundle/index.html', label);
    write(directory, 'TauriNativeGenerated.podspec', 'fixture local pod');
    metadata = { ...IOS_LAYOUT, native, source };
  } else {
    const native = ANDROID_ABIS.map(abi => ({ abi, path: `jniLibs/${abi}/libtauri_native_core.so` }));
    for (const slice of native) write(directory, slice.path, `${label} ${slice.abi}`);
    write(directory, 'assets/tauri-native/index.html', label);
    if (!legacy) write(directory, 'include/tauri_native.h', header);
    metadata = { platform, minimumApiLevel: 24, pageSize: 16384, native, assets: 'assets/tauri-native', integration: null, header: legacy ? null : 'include/tauri_native.h', source };
  }
  writeArtifactManifest(directory, metadata, legacy ? undefined : { schemaVersion: 1, abiVersion, commands: [] });
}
