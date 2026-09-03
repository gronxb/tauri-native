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
  it('builds app-owned artifacts and adds the generated pod once', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'tauri-native-expo-'));
    const projectRoot = path.join(fixtureRoot, 'app');
    const platformProjectRoot = path.join(projectRoot, 'ios');
    const tauriDirectory = path.join(fixtureRoot, 'tauri', 'src-tauri');

    try {
      mkdirSync(tauriDirectory, { recursive: true });
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
      writeFixtureFile(
        projectRoot,
        'node_modules/@tauri-native/cli/package.json',
        '{"bin":{"tauri-native":"./fake-cli.js"}}\n'
      );
      writeFixtureFile(
        projectRoot,
        'node_modules/@tauri-native/cli/fake-cli.js',
        `const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const outputDirectory = args[args.indexOf('--output-dir') + 1];
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(path.join(outputDirectory, 'TauriNativeGenerated.podspec'), 'fixture');
writeFileSync(path.join(process.cwd(), 'cli-invocation.json'), JSON.stringify(args));
`
      );

      const config = { _internal: { projectRoot } };
      const options = { tauriDir: '../tauri/src-tauri' };
      withTauriNative(config, options);
      withTauriNative(config, options);

      const invocation = JSON.parse(
        readFileSync(path.join(projectRoot, 'cli-invocation.json'), 'utf8')
      );
      const outputDirectory = path.join(platformProjectRoot, 'tauri-native');
      assert.deepEqual(invocation, [
        'build',
        'ios',
        '--tauri-dir',
        tauriDirectory,
        '--output-dir',
        outputDirectory,
      ]);
      assert.ok(
        existsSync(
          path.join(outputDirectory, 'TauriNativeGenerated.podspec')
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
