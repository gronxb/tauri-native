'use strict';

const { createHash } = require('node:crypto');
const { lstatSync, readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

// This Node-only reader ships in the host package. It needs neither the CLI nor
// its Rust/NDK/Xcode validation tools; binaries were validated during export.
function readArtifacts(directory, platform) {
  const invalid = (message) => { throw new Error(`Invalid ${platform} artifacts at "${directory}": ${message}`); };
  if (!lstatSync(directory).isDirectory() || !lstatSync(path.join(directory, 'manifest.json')).isFile()) invalid('the artifact root and manifest must not be links');
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (!manifest || manifest.formatVersion !== 1 || manifest.platform !== platform || ![0, 1].includes(manifest.abiVersion)) invalid('unsupported format, platform or ABI');
  const generated = manifest.abiVersion === 1;
  if (manifest.compatibility?.mode !== (generated ? 'generated' : 'legacy') || manifest.compatibility?.verifiedTauri !== (generated ? '2.11.5' : null) || manifest.compatibility?.verifiedApi !== (generated ? '2.11.1' : null)) invalid('unsupported API compatibility');
  if (manifest.commands !== (generated ? 'commands.json' : null)) invalid('invalid command metadata');
  const assets = platform === 'ios' ? 'TauriNativeAssets.bundle' : 'assets/tauri-native';
  if (manifest.assets !== assets || !Array.isArray(manifest.native)) invalid('invalid native/assets layout');
  const required = [`${assets}/index.html`, ...(generated ? ['commands.json'] : [])];
  const headers = [];
  if (platform === 'ios') {
    if (manifest.minimumOsVersion !== '13.0' || manifest.integration !== 'TauriNativeGenerated.podspec' || manifest.native.length !== 2) invalid('invalid iOS layout');
    for (const [variant, architectures] of [['device', 'arm64'], ['simulator', 'arm64,x86_64']]) {
      const slices = manifest.native.filter(slice => slice.variant === variant);
      if (slices.length !== 1 || !Array.isArray(slices[0].architectures) || [...slices[0].architectures].sort().join(',') !== architectures || typeof slices[0].path !== 'string' || !slices[0].path.startsWith('TauriNativeCore.xcframework/')) invalid(`missing ${variant} architectures`);
      headers.push(path.posix.join(path.posix.dirname(slices[0].path), 'Headers/tauri_native.h'));
    }
    required.push('TauriNativeCore.xcframework/Info.plist', 'TauriNativeGenerated.podspec', ...headers);
  } else if (platform === 'android') {
    if (manifest.minimumApiLevel !== 24 || manifest.pageSize !== 16384 || manifest.integration !== null || manifest.header !== (generated ? 'include/tauri_native.h' : null) || manifest.native.length !== 4) invalid('invalid Android layout/API/page alignment');
    for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']) {
      if (manifest.native.filter(slice => slice.abi === abi && slice.path === `jniLibs/${abi}/libtauri_native_core.so`).length !== 1) invalid(`missing ${abi}`);
    }
    if (generated) { headers.push('include/tauri_native.h'); required.push(...headers); }
  } else invalid('unknown platform');
  required.push(...manifest.native.map(slice => slice.path));
  if (!Array.isArray(manifest.files)) invalid('missing file inventory');
  const files = new Map();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !file.path || file.path.includes('\\') || file.path.includes(':') || file.path.includes('\0') || file.path.split('/').some(part => !part || part === '.' || part === '..') || file.path === 'manifest.json' || files.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) invalid('invalid or duplicate file path/checksum');
    files.set(file.path, file);
  }
  let count = 0;
  function visit(prefix = '') {
    for (const entry of readdirSync(path.join(directory, prefix), { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(relative);
      else {
        if (!entry.isFile()) invalid(`links are not portable: ${relative}`);
        if (relative === 'manifest.json') continue;
        const file = files.get(relative); const bytes = readFileSync(path.join(directory, relative));
        if (!file || file.size !== bytes.length || file.sha256 !== createHash('sha256').update(bytes).digest('hex')) invalid(`checksum mismatch or unexpected file: ${relative}`);
        count++;
      }
    }
  }
  visit();
  if (count !== files.size || required.some(file => !files.has(file))) invalid('missing required file');
  if (generated) {
    const model = JSON.parse(readFileSync(path.join(directory, manifest.commands), 'utf8'));
    if (model.schemaVersion !== 1 || model.abiVersion !== 1 || !Array.isArray(model.commands)) invalid('incompatible command metadata');
    for (const header of headers) if (!/^#define TAURI_NATIVE_ABI_VERSION 1\b/m.test(readFileSync(path.join(directory, header), 'utf8'))) invalid('incompatible ABI header');
  }
  return manifest;
}

module.exports = { readArtifacts };
