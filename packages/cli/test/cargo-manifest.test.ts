import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { libraryNameFromManifest } from '../src/utils/cargo-manifest.ts';

describe('libraryNameFromManifest', () => {
  it('uses the library target name and converts Cargo hyphens to underscores', () => {
    const manifest = `
[package]
name = "application-package"

[lib]
name = "native-core"
crate-type = ["staticlib"]
`;

    assert.equal(libraryNameFromManifest(manifest), 'native_core');
  });

  it('falls back to the package name when the library has no explicit name', () => {
    const manifest = `
[package]
name = "native-core"

[lib]
crate-type = ["staticlib"]
`;

    assert.equal(libraryNameFromManifest(manifest), 'native_core');
  });

  it('rejects a manifest without a package or library name', () => {
    assert.throws(
      () => libraryNameFromManifest('[lib]\ncrate-type = ["staticlib"]'),
      /Could not find a package or library name/
    );
  });
});
