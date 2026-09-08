import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { freemem, totalmem } from 'node:os';
import path from 'node:path';

export interface HostProfile {
  name: 'rn' | 'lynx' | 'expo';
  hostVariable: 'RN_HOST' | 'LYNX_HOST' | 'EXPO_HOST';
  sdk: 'react-native' | 'lynx';
  scheme: string;
  appId: string;
}
export type InstalledHost = HostProfile & { directory: string; app?: string };
export type HostRunner = (label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => string;
export const hostProfiles: HostProfile[] = [
  { name: 'rn', hostVariable: 'RN_HOST', sdk: 'react-native', scheme: 'TauriArtifactHost', appId: 'dev.taurinative.rnartifacttest' },
  { name: 'lynx', hostVariable: 'LYNX_HOST', sdk: 'lynx', scheme: 'Hello-Lynx', appId: 'dev.taurinative.lynxartifacttest' },
  { name: 'expo', hostVariable: 'EXPO_HOST', sdk: 'react-native', scheme: 'TauriArtifactExpo', appId: 'dev.taurinative.rnartifacttest' },
];

// Used only by disposable integration hosts; never shipped in SDK packages.
export function buildAndInstallTestHost(profile: InstalledHost, platform: string, run: HostRunner, hostEnv: NodeJS.ProcessEnv, { ios, android }: { ios?: string | undefined; android?: string | undefined }) {
  const host = profile.directory, label = `${profile.name}-${platform}`;
  if (profile.name === 'lynx') run(`${label}-bundle`, 'npm', ['run', platform === 'ios' ? 'build:ios' : 'build'], host, hostEnv);
  if (platform === 'ios') {
    if (profile.name === 'lynx') run(`${label}-pods`, 'bundle', ['exec', 'pod', 'install'], path.join(host, 'ios'), { ...hostEnv, BUNDLE_PATH: 'vendor/bundle' });
    else run(`${label}-pods`, 'pod', ['install'], path.join(host, 'ios'), hostEnv);
    run(`${label}-build`, 'xcodebuild', ['-workspace', `${profile.scheme}.xcworkspace`, '-scheme', profile.scheme, '-configuration', 'Release', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator', '-derivedDataPath', '../build-ios', 'CODE_SIGNING_ALLOWED=NO', 'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES', '-jobs', '2'], path.join(host, 'ios'), hostEnv);
    profile.app = path.join(host, `build-ios/Build/Products/Release-iphonesimulator/${profile.scheme}.app`);
    run(`${label}-install-app`, 'xcrun', ['simctl', 'install', ios!, profile.app], host, hostEnv);
  } else {
    // Maestro's Android accessibility snapshots can omit a recreated WebView's
    // entire DOM. Enable its documented CDP inspection in disposable hosts only.
    const application = path.join(host, 'android/app/src/main/java', profile.name === 'lynx'
      ? 'dev/taurinative/lynxexample/TauriNativeApplication.java' : 'dev/taurinative/rnartifacttest/MainApplication.kt');
    const source = readFileSync(application, 'utf8');
    const inspection = 'android.webkit.WebView.setWebContentsDebuggingEnabled(true)';
    if (!source.includes(inspection)) {
      assert(source.includes('super.onCreate()'), 'Expected the disposable application scaffold');
      writeFileSync(application, source.replace(/super\.onCreate\(\);?/, value =>
        `${value}\n    ${inspection}${profile.name === 'lynx' ? ';' : ''} // Disposable Maestro host only.`));
    }
    run(`${label}-build`, './gradlew', ['--no-daemon', 'assembleRelease', '--max-workers=2'], path.join(host, 'android'), hostEnv);
    profile.app = path.join(host, 'android/app/build/outputs/apk/release/app-release.apk');
    run(`${label}-alignment`, process.env.ZIPALIGN ?? 'zipalign', ['-c', '-P', '16', '-v', '4', profile.app], host, hostEnv);
    try {
      run(`${label}-install-app`, 'adb', ['-s', android!, 'install', '-r', profile.app], host, hostEnv);
    } catch (error) {
      console.error('Runner memory at installation failure:', { totalBytes: totalmem(), freeBytes: freemem() });
      for (const [name, args] of [
        ['memory', ['shell', 'cat', '/proc/meminfo']],
        ['logcat', ['logcat', '-b', 'all', '-d', '-t', '2000']],
      ] as const) {
        try { run(`${label}-install-${name}`, 'adb', ['-s', android!, ...args], host, hostEnv); }
        catch (diagnosticError) { console.error(`Could not collect installation ${name}: ${diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError)}`); }
      }
      throw error;
    }
    // A frozen previous test app can leave an unresponsive CDP socket behind.
    // Limit cleanup to the other applications owned by this acceptance gate.
    for (const appId of new Set(hostProfiles.map(item => item.appId))) {
      if (appId !== profile.appId) run(`${label}-stop-previous`, 'adb', ['-s', android!, 'shell', 'am', 'force-stop', appId], host, hostEnv);
    }
  }
  return profile.app;
}
