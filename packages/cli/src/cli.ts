import { Command } from 'commander';
import { buildIos, type BuildIosOptions } from './commands/build-ios';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('tauri-native')
    .description('Package a Tauri microfrontend for a native host')
    .showHelpAfterError();

  const build = program
    .command('build')
    .description('Build native host artifacts');

  build
    .command('ios')
    .description('Build an XCFramework and a Tauri web asset bundle')
    .option('--tauri-dir <path>', 'Tauri Rust directory', 'src-tauri')
    .option('--manifest <path>', 'native core Cargo.toml')
    .option('--header <path>', 'C ABI header')
    .option('--output-dir <path>', 'generated artifact directory')
    .action((options: BuildIosOptions) => buildIos(options));

  return program;
}
