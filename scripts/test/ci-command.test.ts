import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { output, run } from '../ci/common.ts';
import { buildAndInstallTestHost } from '../../packages/cli/test/native-export/host-build.ts';

test('live CI logs preserve literal arguments and do not hide command failures', () => {
  const label = `logging-scenario-${process.pid}`;
  const log = path.join(output, 'logs', `${label}.log`);
  try {
    const literal = 'a path with spaces/$(exit 99) ${HOME} "quoted"';
    assert.equal(run(label, process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]), literal);
    assert.throws(() => run(label, process.execPath, ['-e',
      'console.log("progress before failure"); console.error("command failed"); process.exit(17);']),
    error => error instanceof assert.AssertionError && error.actual === 17 && error.expected === 0);
    assert.equal(readFileSync(log, 'utf8'), 'progress before failure\ncommand failed\n');
  } finally { rmSync(log, { force: true }); }
});

test('a failed Android installation retains its error when diagnostic collection also fails', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'native-install-failure-'));
  const application = path.join(directory, 'android/app/src/main/java/dev/taurinative/rnartifacttest/MainApplication.kt');
  const installError = new Error('package service disconnected during installation');
  let logcatAttempted = false;
  try {
    mkdirSync(path.dirname(application), { recursive: true });
    writeFileSync(application, 'override fun onCreate() { super.onCreate() }');
    assert.throws(() => buildAndInstallTestHost({ name: 'rn', directory, hostVariable: 'RN_HOST', sdk: 'react-native', scheme: 'TauriArtifactHost', appId: 'dev.taurinative.rnartifacttest' }, 'android', (label, command, args) => {
      if (label.endsWith('-install-app')) throw installError;
      if (command === 'adb' && args.includes('logcat')) {
        logcatAttempted = true;
        throw new Error('device is unavailable for log collection');
      }
      return '';
    }, process.env, { android: 'unavailable-test-device' }), error => error === installError);
    assert(logcatAttempted, 'Failed installation must attempt to retain Android system logs');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
