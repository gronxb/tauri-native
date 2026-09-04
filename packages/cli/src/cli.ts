import { Command } from 'commander';
import {
  exportAndroid,
  type ExportAndroidOptions,
} from './commands/export-android.ts';
import { exportIos, type ExportIosOptions } from './commands/export-ios.ts';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('tauri-native')
    .description('Export a Tauri microfrontend for a native host')
    .showHelpAfterError();

  const exportCommand = program
    .command('export')
    .description('Export Tauri artifacts for a native host');

  exportCommand
    .command('ios')
    .description('Export an XCFramework and a Tauri web asset bundle')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'native core Cargo.toml')
    .option('--header <path>', 'C ABI header')
    .option('--output-dir <path>', 'generated artifact directory')
    .action((options: ExportIosOptions) => exportIos(options));

  exportCommand
    .command('android')
    .description('Export Android Rust libraries and Tauri web assets')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'native core Cargo.toml')
    .option('--output-dir <path>', 'generated artifact directory')
    .action((options: ExportAndroidOptions) => exportAndroid(options));

  return program;
}
