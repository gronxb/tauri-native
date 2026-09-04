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
const androidAbis = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

function writeFixtureFile(root, relativePath, source) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

describe('@tauri-native/react-native Expo config plugin', () => {
  it('installs Tauri-owned iOS and Android exports without removing host files', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tauri-native-expo-'));
    const projectRoot = path.join(fixtureRoot, 'app');
    const platformProjectRoot = path.join(projectRoot, 'ios');
    const tauriDirectory = path.join(fixtureRoot, 'tauri', 'src-tauri');
    const exportDirectory = path.join(
      tauriDirectory,
      'gen/tauri-native/ios'
    );
    const androidExportDirectory = path.join(
      tauriDirectory,
      'gen/tauri-native/android'
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
      for (const abi of androidAbis) {
        writeFixtureFile(
          androidExportDirectory,
          `jniLibs/${abi}/libtauri_native_core.so`,
          abi
        );
      }
      writeFixtureFile(
        androidExportDirectory,
        'assets/tauri-native/index.html',
        'android frontend'
      );
      writeFixtureFile(projectRoot, 'package.json', '{"private":true}\n');
      writeFixtureFile(
        projectRoot,
        'ios/Podfile',
        "platform :ios, '16.4'\n\ntarget 'Fixture' do\nend\n"
      );
      writeFixtureFile(
        projectRoot,
        'android/app/src/main/jniLibs/arm64-v8a/libhost.so',
        'host library'
      );
      writeFixtureFile(
        projectRoot,
        'node_modules/expo/config-plugins/index.js',
        `const path = require('node:path');
exports.withDangerousMod = (config, [platform, action]) => action({
  ...config,
  modRequest: {
    projectRoot: config._internal.projectRoot,
    platformProjectRoot: path.join(
      config._internal.projectRoot,
      platform
    ),
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

      assert.equal(
        readFileSync(
          path.join(
            projectRoot,
            'android/app/src/main/jniLibs/arm64-v8a/libtauri_native_core.so'
          ),
          'utf8'
        ),
        'arm64-v8a'
      );
      assert.equal(
        readFileSync(
          path.join(
            projectRoot,
            'android/app/src/main/assets/tauri-native/index.html'
          ),
          'utf8'
        ),
        'android frontend'
      );
      assert.equal(
        readFileSync(
          path.join(
            projectRoot,
            'android/app/src/main/jniLibs/arm64-v8a/libhost.so'
          ),
          'utf8'
        ),
        'host library'
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
