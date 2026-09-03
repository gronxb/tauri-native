'use strict';

const assert = require('node:assert/strict');
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const withTauriNative = require('../app.plugin.js');

function writeFixtureFile(root, relativePath, source) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('@tauri-native/react-native Expo config plugin', () => {
  it('copies Tauri-owned exports and adds the generated pod once', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tauri-native-expo-'));
    const projectRoot = path.join(fixtureRoot, 'app');
    const platformProjectRoot = path.join(projectRoot, 'ios');
    const tauriDirectory = path.join(fixtureRoot, 'tauri', 'src-tauri');
    const exportDirectory = path.join(
      tauriDirectory,
      'gen/tauri-native/ios'
    );

    try {
      mkdirSync(tauriDirectory, { recursive: true });
      writeFixtureFile(
        exportDirectory,
        'TauriNativeGenerated.podspec',
        'fixture'
      );
      writeFixtureFile(
        exportDirectory,
        'TauriNativeCore.xcframework/Info.plist',
        'fixture'
      );
      writeFixtureFile(
        exportDirectory,
        'TauriNativeAssets.bundle/index.html',
        'fixture'
      );
      writeFixtureFile(projectRoot, 'package.json', '{"private":true}\n');
      writeFixtureFile(
        projectRoot,
        'ios/Podfile',
        "platform :ios, '16.4'\n\ntarget 'Fixture' do\nend\n"
      );
      writeFixtureFile(
        projectRoot,
        'node_modules/expo/config-plugins/index.js',
        `const path = require('node:path');
exports.withDangerousMod = (config, [, action]) => action({
  ...config,
  modRequest: {
    projectRoot: config._internal.projectRoot,
    platformProjectRoot: path.join(config._internal.projectRoot, 'ios'),
  },
});
`
      );
      const config = { _internal: { projectRoot } };
      const options = { tauriDir: '../tauri/src-tauri' };
      withTauriNative(config, options);
      withTauriNative(config, options);

      const outputDirectory = path.join(platformProjectRoot, 'tauri-native');
      assert.ok(
        existsSync(
          path.join(outputDirectory, 'TauriNativeGenerated.podspec')
        )
      );
      assert.ok(
        existsSync(
          path.join(
            outputDirectory,
            'TauriNativeCore.xcframework/Info.plist'
          )
        )
      );
      assert.ok(
        existsSync(
          path.join(outputDirectory, 'TauriNativeAssets.bundle/index.html')
        )
      );

      const podfile = readFileSync(
        path.join(platformProjectRoot, 'Podfile'),
        'utf8'
      );
      assert.equal(
        podfile.match(/pod 'TauriNativeGenerated'/g)?.length,
        1
      );
      assert.match(podfile, /:path => '\.\/tauri-native'/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
