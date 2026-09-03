import { Command } from 'commander';
import { exportIos, type ExportIosOptions } from './commands/export-ios';

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

  return program;
}
