#!/usr/bin/env node

import { execFileSync, execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { wrapTextWithPrefix } from '@clack/core';
import { Command } from 'commander';

function message(text, startPrefix = '◇ ') {
  process.stdout.write(
    `${wrapTextWithPrefix(process.stdout, text, '│ ', startPrefix, '│ ')}\n`
  );
}

function run(command, args, options = {}) {
  message(`${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function requireFile(file) {
  if (!existsSync(file)) {
    throw new Error(`Required file does not exist: ${file}`);
  }
}

function libraryNameFromManifest(manifest) {
  const source = readFileSync(manifest, 'utf8');
  const libSection = source.match(/\[lib\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const packageSection = source.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1];
  const name =
    libSection?.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ??
    packageSection?.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  if (!name) {
    throw new Error(`Could not find a package or library name in ${manifest}`);
  }
  return name.replaceAll('-', '_');
}

function buildIos(options) {
  const workingDirectory = process.cwd();
  const tauriDirectory = path.resolve(workingDirectory, options.tauriDir);
  const manifest = options.manifest
    ? path.resolve(workingDirectory, options.manifest)
    : path.join(tauriDirectory, 'crates/app-core/Cargo.toml');
  const manifestDirectory = path.dirname(manifest);
  const header = options.header
    ? path.resolve(workingDirectory, options.header)
    : path.join(manifestDirectory, 'include/tauri_native.h');
  const outputDirectory = path.resolve(
    workingDirectory,
    options.outputDir ?? path.join(tauriDirectory, 'gen/tauri-native/ios')
  );
  const configPath = path.join(tauriDirectory, 'tauri.conf.json');

  for (const requiredPath of [manifest, header, configPath]) {
    requireFile(requiredPath);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const frontendDirectory = path.dirname(tauriDirectory);
  if (typeof config.build?.beforeBuildCommand === 'string') {
    message(`Building the Tauri microfrontend in ${frontendDirectory}`);
    execSync(config.build.beforeBuildCommand, {
      cwd: frontendDirectory,
      stdio: 'inherit',
    });
  }

  if (typeof config.build?.frontendDist !== 'string') {
    throw new Error(`${configPath} must define build.frontendDist`);
  }

  const frontendDist = path.resolve(tauriDirectory, config.build.frontendDist);
  requireFile(path.join(frontendDist, 'index.html'));

  const libraryName = libraryNameFromManifest(manifest);
  const targetDirectory = path.join(tauriDirectory, 'target/tauri-native');
  const cargoEnvironment = {
    ...process.env,
    CARGO_TARGET_DIR: targetDirectory,
  };
  const targets = [
    'aarch64-apple-ios',
    'aarch64-apple-ios-sim',
    'x86_64-apple-ios',
  ];

  run('rustup', ['target', 'add', ...targets]);
  for (const target of targets) {
    run(
      'cargo',
      ['build', '--manifest-path', manifest, '--target', target, '--release'],
      { env: cargoEnvironment }
    );
  }

  mkdirSync(outputDirectory, { recursive: true });
  const framework = path.join(outputDirectory, 'TauriNativeCore.xcframework');
  const assetBundle = path.join(outputDirectory, 'TauriNativeAssets.bundle');
  const universalDirectory = path.join(
    targetDirectory,
    'ios-simulator-universal/release'
  );
  const universalLibrary = path.join(
    universalDirectory,
    `lib${libraryName}.a`
  );

  mkdirSync(universalDirectory, { recursive: true });
  run('lipo', [
    '-create',
    path.join(
      targetDirectory,
      `aarch64-apple-ios-sim/release/lib${libraryName}.a`
    ),
    path.join(
      targetDirectory,
      `x86_64-apple-ios/release/lib${libraryName}.a`
    ),
    '-output',
    universalLibrary,
  ]);

  rmSync(framework, { recursive: true, force: true });
  run('xcodebuild', [
    '-create-xcframework',
    '-library',
    path.join(
      targetDirectory,
      `aarch64-apple-ios/release/lib${libraryName}.a`
    ),
    '-headers',
    path.dirname(header),
    '-library',
    universalLibrary,
    '-headers',
    path.dirname(header),
    '-output',
    framework,
  ]);

  rmSync(assetBundle, { recursive: true, force: true });
  cpSync(frontendDist, assetBundle, { recursive: true });
  writeFileSync(
    path.join(assetBundle, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>dev.tauri-native.assets</string>
  <key>CFBundleName</key><string>TauriNativeAssets</string>
  <key>CFBundlePackageType</key><string>BNDL</string>
  <key>CFBundleVersion</key><string>1</string>
</dict></plist>
`
  );

  message(`Created ${framework}\nCreated ${assetBundle}`, '◆ ');
}

const program = new Command();
program
  .name('tauri-native')
  .description('Package a Tauri microfrontend for a native host')
  .showHelpAfterError();

const build = program.command('build').description('Build native host artifacts');
build
  .command('ios')
  .description('Build an XCFramework and a Tauri web asset bundle')
  .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
  .option('--manifest <path>', 'native core Cargo.toml')
  .option('--header <path>', 'C ABI header')
  .option('--output-dir <path>', 'generated artifact directory')
  .action(buildIos);

program.parseAsync().catch((error) => {
  process.stderr.write(
    `${wrapTextWithPrefix(process.stderr, error.message, '│ ', '■ ', '│ ')}\n`
  );
  process.exitCode = 1;
});
