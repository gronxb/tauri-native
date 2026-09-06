import { Command } from 'commander';
import {
  exportAndroid,
  type ExportAndroidOptions,
} from './commands/export-android.ts';
import { exportIos, type ExportIosOptions } from './commands/export-ios.ts';
import { inspectProject } from './commands/inspect.ts';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('tauri-native')
    .description('Export a Tauri microfrontend for a native host')
    .showHelpAfterError();

  program.command('inspect')
    .description('Inspect ordinary Tauri commands without building or starting the application')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--json', 'Print the command model or diagnostics as JSON')
    .action(inspectProject);

  const exportCommand = program
    .command('export')
    .description('Export Tauri artifacts for a native host');

  exportCommand
    .command('ios')
    .description('Export an XCFramework and a Tauri web asset bundle')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'legacy application-owned core Cargo.toml')
    .option('--header <path>', 'legacy application-owned C ABI header')
    .option('--output-dir <path>', 'generated artifact directory')
    .action((options: ExportIosOptions) => exportIos(options));

  exportCommand
    .command('android')
    .description('Export Android Rust libraries and Tauri web assets')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'legacy application-owned core Cargo.toml')
    .option('--output-dir <path>', 'generated artifact directory')
    .action((options: ExportAndroidOptions) => exportAndroid(options));

  return program;
}
