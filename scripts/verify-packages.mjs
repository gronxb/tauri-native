import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const packageDirectories = ['cli', 'react-native', 'lynx'];

function collectExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    targets.push(value);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectExportTargets(child, targets);
    }
  }
  return targets;
}

function pack(packageDirectory) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: packageDirectory,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });

  assert.equal(
    result.status,
    0,
    `npm pack failed in ${packageDirectory}\n${result.stdout}\n${result.stderr}`
  );
  const match = result.stdout.match(/(^|\n)(\[\s*\{[\s\S]*\}\s*\])\s*$/);
  assert.ok(match, `Could not parse npm pack output:\n${result.stdout}`);
  return JSON.parse(match[2])[0];
}

for (const directory of packageDirectories) {
  const packageDirectory = path.join(repositoryRoot, 'packages', directory);
  const manifest = JSON.parse(
    readFileSync(path.join(packageDirectory, 'package.json'), 'utf8')
  );
  const packed = pack(packageDirectory);
  const files = new Map(packed.files.map((file) => [file.path, file]));
  const entrypoints = [
    manifest.main,
    manifest.types,
    ...Object.values(manifest.bin ?? {}),
    ...collectExportTargets(manifest.exports),
  ].filter(Boolean);

  assert.equal(manifest.version, '0.0.1');
  assert.deepEqual(manifest.publishConfig, {
    access: 'public',
    registry: 'https://registry.npmjs.org/',
    tag: 'experimental',
  });
  assert.ok(files.has('README.md'), `${manifest.name} must include README.md`);
  assert.ok(files.has('LICENSE'), `${manifest.name} must include LICENSE`);

  for (const target of entrypoints) {
    const packedPath = target.replace(/^\.\//, '');
    assert.ok(
      files.has(packedPath),
      `${manifest.name} entrypoint ${target} is missing from its tarball`
    );
  }

  for (const file of files.keys()) {
    assert.doesNotMatch(
      file,
      /(^|\/)ios\/Generated\/|\.xcframework\/|\.bundle\/|\.a$/,
      `${manifest.name} contains app-specific native output: ${file}`
    );
  }

  if (manifest.bin) {
    for (const target of Object.values(manifest.bin)) {
      const packedFile = files.get(target.replace(/^\.\//, ''));
      assert.ok(
        packedFile.mode & 0o111,
        `${manifest.name} bin ${target} is not executable`
      );
    }
  }

  process.stdout.write(
    `Verified ${packed.id}: ${packed.entryCount} files, ${packed.unpackedSize} bytes\n`
  );
}
