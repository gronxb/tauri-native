import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Run = (label: string, command: string, args: string[], cwd?: string) => string;
const marker = 'authored-by-producer';

/** Ordinary native edits made before export, with no renderer/bridge imports. */
export function prepareNativeConfiguration(platform: 'ios' | 'android', producer: string, run: Run) {
  run('ordinary-native-init', 'npm', ['run', 'tauri', '--', platform, 'init', '--ci', '--skip-targets-install'], producer);
  const native = path.join(producer, 'src-tauri/gen', platform === 'ios' ? 'apple' : 'android');
  if (platform === 'ios') {
    const project = path.join(native, 'ordinary-tauri-mobile-fieldnotes.xcodeproj/project.pbxproj');
    const source = readFileSync(project, 'utf8');
    assert(source.includes('IPHONEOS_DEPLOYMENT_TARGET = 14.0;'));
    writeFileSync(project, source.replaceAll('IPHONEOS_DEPLOYMENT_TARGET = 14.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;'));
    run('ordinary-native-info', 'plutil', ['-insert', 'ProducerNativeMarker', '-string', marker,
      path.join(native, 'ordinary-tauri-mobile-fieldnotes_iOS/Info.plist')]);
  } else {
    const manifest = path.join(native, 'app/src/main/AndroidManifest.xml');
    const source = readFileSync(manifest, 'utf8');
    assert(source.includes('</application>'));
    writeFileSync(manifest, source.replace('</application>', `<meta-data android:name="producer.native.marker" android:value="${marker}" />\n    </application>`));
    writeFileSync(path.join(native, 'app/src/main/assets/producer-note.txt'), marker);
  }
}

/** Inspect packaged native configuration, not only the copied input text. */
export function assertNativeConfiguration(platform: 'ios' | 'android', binary: string, run: Run) {
  if (platform === 'ios') {
    const info = JSON.parse(run('preserved-native-info', 'plutil', ['-convert', 'json', '-o', '-', path.join(path.dirname(binary), 'Info.plist')]));
    assert.equal(info.ProducerNativeMarker, marker);
    assert.equal(info.MinimumOSVersion, '15.0', 'Export must preserve the authored Xcode deployment setting');
  } else {
    assert.equal(run('preserved-native-resource', 'unzip', ['-p', binary, 'assets/producer-note.txt']), marker);
    const manifest = run('preserved-native-manifest', path.join(process.env.ANDROID_HOME!, 'build-tools/37.0.0/aapt2'),
      ['dump', 'xmltree', binary, '--file', 'AndroidManifest.xml']);
    assert(manifest.includes('producer.native.marker') && manifest.includes(marker));
  }
}
