'use strict';

const { spawnSync } = require('node:child_process');
const { statSync, readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const packageName = '@tauri-native/react-native';
const cliPackageName = '@tauri-native/cli';

function fail(message) {
  return new Error(`[${packageName}] ${message}`);
}

function projectRequire(projectRoot) {
  return createRequire(path.join(projectRoot, 'package.json'));
}

function resolveTauriDir(projectRoot, tauriDir) {
  if (typeof tauriDir !== 'string' || tauriDir.trim() === '') {
    throw fail(
      'The Expo config plugin requires a non-empty "tauriDir" option. ' +
        'Example: ["@tauri-native/react-native", {"tauriDir":"../tauri/src-tauri"}]'
    );
  }

  const resolved = path.resolve(projectRoot, tauriDir);

  try {
    if (statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {}

  throw fail(
    `tauriDir "${resolved}" is not a directory. ` +
      `The path is resolved relative to the Expo project root "${projectRoot}".`
  );
}

function resolveCliBin(projectRoot) {
  const requireFromProject = projectRequire(projectRoot);
  let packageJsonPath;

  try {
    packageJsonPath = requireFromProject.resolve(`${cliPackageName}/package.json`);
  } catch {
    throw fail(
      `Could not resolve ${cliPackageName} from the Expo project "${projectRoot}". ` +
        `Install ${cliPackageName} in that project.`
    );
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const declaredBin =
    typeof packageJson.bin === 'string'
      ? packageJson.bin
      : packageJson.bin?.['tauri-native'];

  if (typeof declaredBin !== 'string') {
    throw fail(
      `${cliPackageName} at "${path.dirname(packageJsonPath)}" does not declare the expected "tauri-native" bin.`
    );
  }

  const binPath = path.resolve(path.dirname(packageJsonPath), declaredBin);

  try {
    if (statSync(binPath).isFile()) {
      return binPath;
    }
  } catch {}

  throw fail(
    `The declared ${cliPackageName} bin does not exist at "${binPath}". ` +
      `Reinstall or build ${cliPackageName} in the Expo project.`
  );
}

function runIosBuild(projectRoot, tauriDir) {
  const resolvedTauriDir = resolveTauriDir(projectRoot, tauriDir);
  const cliBin = resolveCliBin(projectRoot);
  const outputDir = path.join(__dirname, 'ios', 'Generated');
  const args = [
    cliBin,
    'build',
    'ios',
    '--tauri-dir',
    resolvedTauriDir,
    '--output-dir',
    outputDir,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw fail(`Failed to start ${cliPackageName}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const outcome = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status}`;
    const command = [process.execPath, ...args]
      .map((value) => JSON.stringify(value))
      .join(' ');

    throw fail(
      `${cliPackageName} build ios failed with ${outcome}. Re-run the command for details: ${command}`
    );
  }
}

module.exports = function withTauriNative(config, options = {}) {
  const configProjectRoot = config?._internal?.projectRoot ?? process.cwd();
  let withDangerousMod;

  try {
    ({ withDangerousMod } = projectRequire(configProjectRoot)(
      'expo/config-plugins'
    ));
  } catch {
    throw fail(
      `Could not load expo/config-plugins from "${configProjectRoot}". ` +
        'Install Expo SDK 57 in the consuming app.'
    );
  }

  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      runIosBuild(modConfig.modRequest.projectRoot, options?.tauriDir);
      return modConfig;
    },
  ]);
};
