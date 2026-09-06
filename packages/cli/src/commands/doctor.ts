import { existsSync } from 'node:fs';
import path from 'node:path';
import { ArtifactError } from '../../../../scripts/artifacts.cjs';
import { projectCopyRoot, projectFingerprints } from '../adapter/workspace.ts';
import { androidTools } from '../artifacts/android.ts';
import { inventory, sha256 } from '../artifacts/files.ts';
import { validateArtifactManifest, type ArtifactManifest } from '../artifacts/manifest.ts';
import { commandOutput, DiscoveryError, type Diagnostic } from '../discovery/native-tool.ts';
import { discoverProject, type ProjectModel } from '../discovery/project.ts';
import packageJson from '../../package.json' with { type: 'json' };

type Platform = 'ios' | 'android';
export interface DoctorOptions { tauriDir?: string; artifacts?: string; platform?: Platform; json?: boolean }
interface Check { id: string; status: 'pass' | 'fail' | 'warn'; code: string; message: string; hint?: string; diagnostics?: Diagnostic[] }
interface Freshness { status: 'unknown' | 'recorded_inputs_match' | 'changed'; compared: string[]; changed: string[]; note: string }
const targets = {
  ios: ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios'],
  android: ['aarch64-linux-android', 'armv7-linux-androideabi', 'i686-linux-android', 'x86_64-linux-android'],
};

export function diagnose(options: DoctorOptions, knownProject?: ProjectModel) {
  const producerMode = !options.artifacts || options.tauriDir !== undefined;
  const platforms: Platform[] = options.platform ? [options.platform] : producerMode ? ['ios', 'android'] : [];
  const checks: Check[] = [];
  let freshness: Freshness = { status: 'unknown', compared: [], changed: [], note: 'Producer source was not compared. Artifact integrity does not establish source freshness.' };
  function check<T>(id: string, hint: string, operation: () => T, code = 'check_failed'): T | undefined {
    try {
      const value = operation();
      checks.push({ id, status: 'pass', code: 'ok', message: typeof value === 'string' ? value : 'Check passed.' });
      return value;
    } catch (error) {
      const failure = error as Error & { code?: string };
      const specific = error instanceof DiscoveryError || error instanceof ArtifactError || failure.code === 'inspector_not_prepared';
      checks.push({ id, status: 'fail', code: failure.code ?? code,
        message: specific ? failure.message : `${id} check failed.`, hint,
        ...(error instanceof DiscoveryError ? { diagnostics: error.diagnostics } : {}),
      });
      return undefined;
    }
  }
  const run = (command: string, args: string[]) => commandOutput(command, args, undefined, true).trim();
  let project: ProjectModel | undefined;
  if (producerMode) {
    const rust = check('rustc', 'Install/select an existing Rust toolchain, then rerun doctor.', () => run('rustc', ['--version']));
    const cargo = check('cargo', 'Install/select an existing Cargo toolchain, then rerun doctor.', () => run('cargo', ['--version']));
    const installed = check('rust-targets', 'Install the listed mobile targets with rustup target add.', () => run('rustup', ['target', 'list', '--installed']));
    if (installed !== undefined) for (const platform of platforms) {
      const missing = targets[platform].filter(target => !installed.split(/\s+/).includes(target));
      checks.push({ id: `${platform}-targets`, status: missing.length ? 'fail' : 'pass', code: missing.length ? 'rust_target_missing' : 'ok',
        message: missing.length ? `Missing targets: ${missing.join(', ')}` : 'Required targets are installed.',
        ...(missing.length ? { hint: `Run rustup target add ${missing.join(' ')} outside doctor.` } : {}),
      });
    }
    if (rust && cargo) project = check('project', 'Resolve the source diagnostic or run tauri-native inspect to prepare its inspector.', () => {
      const value = knownProject ?? discoverProject(options.tauriDir ?? 'src-tauri', process.cwd(), true);
      projectCopyRoot(value);
      return value;
    }, 'project_unsupported');
    else checks.push({ id: 'project', status: 'warn', code: 'project_not_checked', message: 'Command compatibility was not checked because Rust/Cargo is unavailable.' });
    if (project) {
      checks.at(-1)!.message = `${project.commands.length} registered commands satisfy the discovery subset.`;
      checks.push({ id: 'build-boundary', status: 'warn', code: 'build_not_run', message: 'Frontend hooks, dependency resolution, compilation and application initialization were not run. Export remains the execution/compatibility gate.' });
    }
    if (platforms.includes('ios')) {
      if (process.platform !== 'darwin') checks.push({ id: 'ios-host', status: 'fail', code: 'host_platform_unsupported', message: 'iOS export requires macOS with Xcode.', hint: 'Use --platform android when checking an Android-only producer.' });
      else {
        check('xcode', 'Install/select Xcode and finish its first-launch setup.', () => run('xcodebuild', ['-version']));
        for (const sdk of ['iphoneos', 'iphonesimulator']) check(sdk, `Select an Xcode installation containing ${sdk}.`, () => run('xcrun', ['--sdk', sdk, '--show-sdk-path']));
        check('apple-compiler', 'Select Xcode with the Apple compiler installed.', () => run('xcrun', ['--find', 'clang']));
      }
    }
    if (platforms.includes('android')) {
      const ndk = check('cargo-ndk', 'Install cargo-ndk outside doctor.', () => run('cargo', ['ndk', '--version']));
      if (ndk) check('android-ndk', 'Install/select an Android NDK using the cargo-ndk NDK/SDK environment settings. Its compiler, readelf and API metadata must exist.', () => {
        let tools;
        try { tools = androidTools(true); }
        catch { throw Object.assign(new Error('Android NDK is unavailable'), { code: 'ndk_unavailable' }); }
        for (const file of [tools.readelf, tools.systemLibraries]) if (!existsSync(file)) throw Object.assign(new Error('Incomplete Android NDK'), { code: 'ndk_incomplete' });
        const compiler = path.join(tools.bin, process.platform === 'win32' ? 'clang.exe' : 'clang');
        if (!existsSync(compiler)) throw Object.assign(new Error('Android compiler is missing'), { code: 'ndk_compiler_missing' });
        return run(compiler, ['--version']).split('\n')[0]!;
      }, 'ndk_unavailable');
    }
  }

  let artifact: ArtifactManifest | undefined;
  if (options.artifacts) {
    const directory = path.resolve(options.artifacts);
    artifact = check('artifacts', 'Copy a complete matching export; do not edit its receipt or individual members.', () => {
      const value = validateArtifactManifest(directory);
      if (options.platform && value.platform !== options.platform) throw new ArtifactError('artifact_platform', `Expected ${options.platform} artifacts, received ${value.platform}.`);
      return value;
    });
    if (artifact) {
      checks.at(-1)!.message = `Portable ${artifact.platform} receipt, ABI ${artifact.abiVersion}, layout and every file checksum match.`;
      if (!producerMode && !platforms.length) platforms.push(artifact.platform);
      if (artifact.generator.version !== packageJson.version) checks.push({ id: 'generator', status: 'warn', code: 'generator_version_differs', message: `Export generator ${artifact.generator.version} differs from this CLI ${packageJson.version}; the declared format/API contract passed.` });
    }
  }
  if (project && artifact?.compatibility.mode === 'generated') {
    const inputs = check('source-inputs', 'Make the recorded source files readable; doctor will not rebuild frontend output.', () => {
      const values = projectFingerprints(project!);
      if (existsSync(project!.frontend.dist)) values.frontendSha256 = sha256(JSON.stringify(inventory(project!.frontend.dist)));
      return values;
    });
    if (inputs) {
      const compared = Object.keys(artifact.source).filter(key => inputs[key] !== undefined).sort();
      const changed = compared.filter(key => artifact!.source[key] !== inputs[key]);
      freshness = { status: changed.length ? 'changed' : compared.length ? 'recorded_inputs_match' : 'unknown', compared, changed,
        note: 'Only recorded input hashes and existing built frontend bytes were compared. Matching hashes do not prove that all authored frontend/dependency inputs are current.' };
      if (changed.length) checks.push({ id: 'freshness', status: 'fail', code: 'source_changed', message: `Recorded inputs differ: ${changed.join(', ')}`, hint: 'Re-export from the intended producer and replace the complete host artifact.' });
    }
  }
  return { schemaVersion: 1, ok: checks.every(item => item.status !== 'fail'), mode: producerMode ? 'producer' : 'artifacts', platforms, checks, freshness };
}

/** Export may install missing Rust targets as before, but probes tools before running build hooks. */
export function assertExportReady(project: ProjectModel, platform: Platform): void {
  const failures = diagnose({ tauriDir: project.tauriDirectory, platform }, project).checks
    .filter(item => item.status === 'fail' && item.code !== 'rust_target_missing');
  if (failures.length) throw Object.assign(new Error(failures.map(item => `${item.id} [${item.code}]: ${item.message}\n${item.hint ?? ''}`).join('\n')), { code: 'preflight_failed' });
}

export function doctor(options: DoctorOptions): void {
  const report = diagnose(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`tauri-native doctor: ${report.mode} (${report.ok ? 'passed' : 'failed'})`);
    for (const item of report.checks) {
      console.log(`${item.status.toUpperCase()} ${item.id} [${item.code}] ${item.message}`);
      if (item.hint) console.log(`  ${item.hint}`);
    }
    console.log(`Freshness: ${report.freshness.status}. ${report.freshness.note}`);
  }
  if (!report.ok) process.exitCode = 1;
}
