import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ANDROID_ABIS,
  copyAndroidLibraries,
} from '../src/commands/export-android.ts';

describe('copyAndroidLibraries', () => {
  it('normalizes every Cargo library to the stable Android loader name', () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), 'tauri-native-android-artifacts-')
    );
    const cargoOutput = path.join(fixtureRoot, 'cargo-output');
    const outputDirectory = path.join(fixtureRoot, 'export');

    try {
      for (const abi of ANDROID_ABIS) {
        const libraryDirectory = path.join(cargoOutput, abi);
        mkdirSync(libraryDirectory, { recursive: true });
        writeFileSync(
          path.join(libraryDirectory, 'libapplication_core.so'),
          abi
        );
      }

      copyAndroidLibraries(
        cargoOutput,
        outputDirectory,
        'application_core'
      );

      for (const abi of ANDROID_ABIS) {
        assert.equal(
          readFileSync(
            path.join(
              outputDirectory,
              'jniLibs',
              abi,
              'libtauri_native_core.so'
            ),
            'utf8'
          ),
          abi
        );
      }
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
