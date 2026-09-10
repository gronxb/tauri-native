#!/usr/bin/env node
const { prebuildRetainedExpo } = require('../prebuild.js');
const args = process.argv.slice(2);
const platforms = args.filter(value => value === 'ios' || value === 'android');
if (args.filter(value => value === '--platform').length !== 1 || platforms.length !== 1 || args[args.indexOf('--platform') + 1] !== platforms[0] || args.some(value => !['--platform', '--clean', 'ios', 'android'].includes(value))) {
  console.error('Usage: tauri-native-prebuild --platform ios|android [--clean]');
  process.exitCode = 1;
} else {
  prebuildRetainedExpo({ platform: platforms[0], clean: args.includes('--clean') })
    .then(result => process.stdout.write(result.log))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
