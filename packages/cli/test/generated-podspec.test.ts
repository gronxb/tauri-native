import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { writeGeneratedPodspec } from '../src/commands/export-ios.ts';

describe('writeGeneratedPodspec', () => {
  it('creates the local pod consumed by the React Native and Lynx packages', () => {
    const outputDirectory = mkdtempSync(
      path.join(tmpdir(), 'tauri-native-generated-pod-')
    );

    try {
      const podspec = writeGeneratedPodspec(outputDirectory);
      const source = readFileSync(podspec, 'utf8');

      assert.equal(
        podspec,
        path.join(outputDirectory, 'TauriNativeGenerated.podspec')
      );
      assert.match(source, /s\.name = "TauriNativeGenerated"/);
      assert.match(
        source,
        /s\.vendored_frameworks = "TauriNativeCore\.xcframework"/
      );
      assert.match(source, /s\.resources = "TauriNativeAssets\.bundle"/);
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  });
});
