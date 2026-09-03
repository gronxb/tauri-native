import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { message } from './output';

export function run(
  command: string,
  args: string[],
  options: ExecFileSyncOptions = {}
): void {
  message(`${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}
