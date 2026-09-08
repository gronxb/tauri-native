import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { run } from './common.ts';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This setup creates a simulator only on an ephemeral Actions runner');
const runtimes = JSON.parse(run('simulator-runtimes', 'xcrun', ['simctl', 'list', 'runtimes', '--json'])).runtimes as { isAvailable: boolean; version: string; identifier: string }[];
const runtime = runtimes.find(item => item.isAvailable && item.version === '26.4.1' && item.identifier.includes('.iOS-'));
assert(runtime, 'The pinned iOS 26.4.1 simulator runtime is required');
const device = run('create-simulator', 'xcrun', ['simctl', 'create', 'TauriNativeAcceptance', 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', runtime.identifier]).trim();
run('boot-simulator', 'xcrun', ['simctl', 'boot', device]);
run('boot-ready', 'xcrun', ['simctl', 'bootstatus', device, '-b']);
appendFileSync(process.env.GITHUB_ENV!, `IOS_SIMULATOR_UDID=${device}\n`);
