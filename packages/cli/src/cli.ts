import { Command, Option } from 'commander';
import {
  exportAndroid,
  type ExportAndroidOptions,
} from './commands/export-android.ts';
import { exportIos, type ExportIosOptions } from './commands/export-ios.ts';
import { inspectProject } from './commands/inspect.ts';
import { doctor } from './commands/doctor.ts';
import { watchExport } from './commands/watch.ts';
import { exportRetainedAndroid } from './runtime/export-android.ts';
import type { RetainedExportOptions } from './runtime/export-project.ts';
import { exportRetainedIos } from './runtime/export-ios.ts';

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
    .addOption(new Option('--runtime <runtime>', 'Inspect the limited adapter or retained Tauri runtime contract').choices(['adapter', 'retained']).default('adapter'))
    .action(inspectProject);

  program.command('doctor')
    .description('Diagnose a producer or copied artifacts without installing, building or changing files')
    .option('--tauri-dir <path>', 'Ordinary Tauri directory (defaults to src-tauri unless only --artifacts is given)')
    .option('--artifacts <path>', 'Copied platform export directory; works without source or Rust')
    .addOption(new Option('--platform <platform>', 'Limit producer checks or require an artifact platform').choices(['ios', 'android']))
    .option('--json', 'Print stable diagnostic codes and evidence as JSON')
    .action(doctor);

  const exportCommand = program
    .command('export')
    .description('Export Tauri artifacts for a native host');

  exportCommand
    .command('ios')
    .description('Export an XCFramework and a Tauri web asset bundle')
    .addOption(new Option('--runtime <runtime>', 'Select limited adapter or retained Tauri bootstrap').choices(['adapter', 'retained']).default('adapter'))
    .option('--caller-policy <path>', 'Retained runtime: explicit native caller delegation JSON')
    .option('--targets <targets>', 'Retained runtime: comma-separated aarch64,aarch64-sim,x86_64 (default: all)')
    .option('--debug', 'Retained runtime: export Debug Rust libraries for native acceptance')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'legacy application-owned core Cargo.toml')
    .option('--header <path>', 'legacy application-owned C ABI header')
    .option('--output-dir <path>', 'generated artifact directory')
    .option('--incremental', 'Reuse a validated export when recorded build inputs are unchanged')
    .option('--force', 'Bypass the incremental result cache and rerun build steps')
    .option('--watch', 'Watch inputs and serialize incremental exports; host rebuild/install remains explicit')
    .action((options: ExportIosOptions & RetainedExportOptions & { runtime: string }) => {
      if (options.runtime === 'retained') return exportRetainedIos(options);
      if (options.callerPolicy || options.targets || options.debug) throw new Error('--caller-policy, --targets and --debug require --runtime retained.');
      return options.watch ? watchExport('ios', options) : exportIos(options);
    });

  exportCommand
    .command('android')
    .description('Export Android Rust libraries and Tauri web assets')
    .addOption(new Option('--runtime <runtime>', 'Select limited adapter or retained Tauri bootstrap').choices(['adapter', 'retained']).default('adapter'))
    .option('--caller-policy <path>', 'Retained runtime: explicit native caller delegation JSON')
    .option('--targets <targets>', 'Retained runtime: comma-separated aarch64,armv7,i686,x86_64 (default: all)')
    .option('--debug', 'Retained runtime: export Debug Rust libraries for native acceptance')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'legacy application-owned core Cargo.toml')
    .option('--output-dir <path>', 'generated artifact directory')
    .option('--incremental', 'Reuse a validated export when recorded build inputs are unchanged')
    .option('--force', 'Bypass the incremental result cache and rerun build steps')
    .option('--watch', 'Watch inputs and serialize incremental exports; host rebuild/install remains explicit')
    .action((options: ExportAndroidOptions & RetainedExportOptions & { runtime: string }) => {
      if (options.runtime === 'retained') return exportRetainedAndroid(options);
      if (options.callerPolicy || options.targets || options.debug) throw new Error('--caller-policy, --targets and --debug require --runtime retained.');
      return options.watch ? watchExport('android', options) : exportAndroid(options);
    });

  return program;
}
