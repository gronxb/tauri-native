import { fileURLToPath } from 'node:url';
import { readArtifacts } from '@tauri-native/lynx/artifacts';

const platform = process.argv[2];
if (platform !== 'ios' && platform !== 'android') throw new Error('Choose ios or android');
readArtifacts(fileURLToPath(new URL(`../tauri-native/${platform}`, import.meta.url)), platform);
