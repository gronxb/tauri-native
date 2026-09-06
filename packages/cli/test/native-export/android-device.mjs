import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export async function verifyAndroidConsumer(preparedFile) {
  const evidence = path.dirname(path.resolve(preparedFile));
  rmSync(path.join(evidence, 'report.json'), { force: true });
  const prepared = JSON.parse(readFileSync(preparedFile));
  assert.equal(prepared.schemaVersion, 1);
  const { bundleId } = prepared;
  assert.match(bundleId, /^dev\.taurinative\.artifacttest\.run\d+$/);
  assert.equal(prepared.apk, 'Independent Host/ArtifactHost.apk');
  const apk = path.join(evidence, prepared.apk);
  assert.equal(createHash('sha256').update(readFileSync(apk)).digest('hex'), prepared.apkSha256, 'Transferred APK bytes changed');
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  assert(sdk, 'Set ANDROID_HOME to the receiving host SDK');
  const adb = path.join(sdk, 'platform-tools/adb');
  const hostEnvironment = { ...process.env, PATH: '/usr/bin:/bin' };
  let serial, installed = false;
  function host(command, args, options = {}) {
    const result = spawnSync(command, args, { env: hostEnvironment, encoding: 'utf8', ...options });
    assert.equal(result.status, 0, `${command}: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  function device(args) { return host(adb, ['-s', serial, ...args]); }
  try {
    const devices = host(adb, ['devices']).split('\n').filter(line => /^emulator-\d+\s+device\s*$/.test(line) && (!process.env.ANDROID_SERIAL || line.startsWith(`${process.env.ANDROID_SERIAL}\t`)));
    assert.equal(devices.length, 1, 'Select one running 16 KB Android emulator with ANDROID_SERIAL, or run exactly one emulator');
    serial = devices[0].split(/\s+/)[0];
    assert.equal(device(['shell', 'getconf', 'PAGE_SIZE']).trim(), '16384');
    const api = device(['shell', 'getprop', 'ro.build.version.sdk']).trim();
    const architecture = device(['shell', 'getprop', 'ro.product.cpu.abi']).trim();
    device(['install', apk]); installed = true;
    device(['shell', 'am', 'start', '-W', '-n', `${bundleId}/dev.taurinative.artifacttest.MainActivity`]);
    let result; const deadline = Date.now() + 50000;
    while (!result && Date.now() < deadline) {
      const read = spawnSync(adb, ['-s', serial, 'exec-out', 'run-as', bundleId, 'cat', 'files/report.json'], { env: hostEnvironment, encoding: 'utf8' });
      // adb exec-out may return status 0 for a remote cat error before the app
      // atomically publishes its report; only parse an actual JSON response.
      if (read.status === 0 && read.stdout.trim().startsWith('{')) result = JSON.parse(read.stdout);
      else await setTimeout(500);
    }
    assert.ok(result, 'Android consumer did not finish');
    writeFileSync(path.join(evidence, 'native-result.json'), JSON.stringify(result, null, 2) + '\n');
    assert.equal(result.fatal, undefined);
    assert.equal(result.abiVersion, 2); assert.equal(result.responses, 11); assert.equal(result.responses, result.frees);
    assert.deepEqual(result.direct, [
      { abiVersion: 2, ok: true, value: { displayName: '한글 🦀', total: 10 } },
      { abiVersion: 2, ok: false, error: { kind: 'empty_name', message: 'A name is required' } },
      { abiVersion: 2, ok: true, value: null },
    ]);
    assert.deepEqual(result.frontend, {
      success: { displayName: '한글 🦀', total: 10 }, error: { kind: 'empty_name', message: 'A name is required' },
      camelCase: 'Hello again, Ada!', unregisteredRejected: true, absent: null, explicitNull: null, unit: null,
      selection: { type: 'display-name', data: '한글' },
    });
    writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({
      ...prepared.export, ...result, emulator: { api, architecture, pageSize: 16384 },
      transferredApkSha256: prepared.apkSha256,
      executionMatrix: 'All four ABIs built/inspected; only the named emulator ABI executed',
    }, null, 2) + '\n');
    console.log(`PASS: copied Android APK on a 16 KB emulator. Evidence: ${evidence}/report.json`);
  } finally {
    if (installed) spawnSync(adb, ['-s', serial, 'uninstall', bundleId], { env: hostEnvironment });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], 'Usage: node android-device.mjs CONSUMER_PREPARED_JSON');
  await verifyAndroidConsumer(process.argv[2]);
}
