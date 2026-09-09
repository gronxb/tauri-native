import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRetainedArtifacts } from '../../../../scripts/retained-artifacts.ts';
import { sha256 } from '../../src/artifacts/files.ts';
import { snapshot } from '../native-export/source-integrity.ts';
import { acquireMobileTest } from './mobile-lock.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const evidence = path.join(root, 'target/retained-slices');
const fixture = path.join(root, 'packages/cli/test/fixtures/mobile-plugin-tauri');
const producer = path.join(evidence, 'ordinary producer');
const original = snapshot(fixture);
const release = acquireMobileTest(root);
const env = { ...process.env, NODE_OPTIONS: '', CARGO_TARGET_DIR: path.join(root, 'target') };
const consumerEnv = { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
mkdirSync(evidence, { recursive: true }); rmSync(path.join(evidence, 'report.json'), { force: true });
function run(label: string, command: string, args: string[], cwd = evidence, environment: NodeJS.ProcessEnv = env) {
  console.log(`> retained-slices: ${label}`);
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path.join(evidence, `${label}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, 0, `${label}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
try {
  rmSync(producer, { recursive: true, force: true }); cpSync(fixture, producer, { recursive: true });
  run('dependencies', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], producer);
  const before = snapshot(producer);
  const policy = path.join(evidence, 'callers.json');
  cpSync(new URL('./composition/fieldnotes-callers.json', import.meta.url), policy);
  const artifacts: Record<string, ReturnType<typeof readRetainedArtifacts>> = {};
  for (const platform of ['ios', 'android'] as const) {
    const output = path.join(evidence, platform);
    run(`export-${platform}`, process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'export', platform, '--runtime', 'retained',
      '--tauri-dir', path.join(producer, 'src-tauri'), '--caller-policy', policy, '--output-dir', output, '--incremental']);
    artifacts[platform] = readRetainedArtifacts(output);
    assert.equal(artifacts[platform].profile, 'release'); assert.deepEqual(snapshot(producer), before);
  }
  rmSync(producer, { recursive: true });
  const ios = artifacts.ios!; assert.equal(ios.platform, 'ios');
  assert.deepEqual(ios.native.map(slice => [slice.variant, slice.architectures]), [['device', ['arm64']], ['simulator', ['arm64', 'x86_64']]]);
  const android = artifacts.android!; assert.equal(android.platform, 'android');
  assert.deepEqual(android.native.map(slice => slice.abi).sort(), ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64']);
  const binaries: { target: string; sha256: string; architectures?: string }[] = [];
  for (const platform of ['ios', 'android'] as const) {
    const exported = path.join(evidence, platform), consumer = path.join(evidence, `${platform} consumer with spaces`);
    rmSync(consumer, { recursive: true, force: true }); cpSync(exported, consumer, { recursive: true });
    assert.deepEqual(readRetainedArtifacts(consumer), artifacts[platform]);
    const diagnosis = JSON.parse(run(`doctor-${platform}`, process.execPath, [path.join(root, 'packages/cli/dist/index.mjs'), 'doctor', '--artifacts', consumer, '--platform', platform, '--json'], evidence, consumerEnv));
    assert.equal(diagnosis.ok, true);
    if (platform === 'ios') {
      for (const [sdk, arch] of [['iphoneos', 'arm64'], ['iphonesimulator', 'arm64'], ['iphonesimulator', 'x86_64']]) {
        const target = `${sdk}-${arch}`, derived = path.join(evidence, `derived-${target}`);
        run(`link-${target}`, 'xcodebuild', ['-project', ios.bootstrap.xcodeProject, '-scheme', ios.bootstrap.target, '-configuration', 'release',
          '-sdk', sdk!, '-arch', arch!, '-derivedDataPath', derived, 'ONLY_ACTIVE_ARCH=NO', 'CODE_SIGNING_ALLOWED=NO', 'build'], path.join(consumer, 'ios'), consumerEnv);
        const binary = path.join(derived, `Build/Products/release-${sdk}/Tauri Mobile Fieldnotes.app/Tauri Mobile Fieldnotes`);
        const architectures = run(`arch-${target}`, 'lipo', ['-archs', binary]); assert.equal(architectures, arch);
        binaries.push({ target, architectures, sha256: sha256(readFileSync(binary)) });
      }
    } else {
      run('link-android', './gradlew', ['--no-daemon', 'assembleRelease'], path.join(consumer, 'android'), consumerEnv);
      const apk = path.join(consumer, 'android/app/build/outputs/apk/release/app-release-unsigned.apk');
      const buildTools = path.join(process.env.ANDROID_HOME!, 'build-tools');
      const zipalign = readdirSync(buildTools).filter(version => /^\d+\.\d+\.\d+$/.test(version)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
        .map(version => path.join(buildTools, version, 'zipalign')).find(existsSync); assert(zipalign);
      run('android-apk-alignment', zipalign, ['-c', '-P', '16', '-v', '4', apk]);
      const entries = run('android-apk-libraries', 'unzip', ['-Z1', apk]).split('\n').filter(file => /^lib\/.*\.so$/.test(file));
      assert.deepEqual(entries.sort(), android.native.map(slice => `lib/${slice.abi}/${path.basename(slice.path)}`).sort());
      binaries.push({ target: 'Android universal Release/R8 APK, all four ABIs', sha256: sha256(readFileSync(apk)) });
    }
    assert.deepEqual(readRetainedArtifacts(exported), artifacts[platform]);
  }
  assert(!existsSync(producer)); assert.deepEqual(snapshot(fixture), original);
  writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, profile: 'release', producerDeleted: true, sourceHashes: original,
    sourceFreeBuild: 'Relocated paths with spaces; PATH=/usr/bin:/bin:/usr/sbin:/sbin',
    scope: 'All seven native slices and source-free consumer linking. Runtime feature execution is separately verified on arm64 simulator/emulator; this does not claim physical devices or execution on every architecture.',
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([platform, manifest]) => [platform, { native: manifest.native, manifestSha256: sha256(readFileSync(path.join(evidence, platform, 'manifest.json'))) }])), binaries,
  }, null, 2) + '\n');
  console.log('PASS: all retained Release slices, source-free iOS consumer links and Android universal APK alignment');
} finally { release(); assert.deepEqual(snapshot(fixture), original); }
