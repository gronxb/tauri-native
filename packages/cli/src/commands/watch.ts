import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportInputs } from '../artifacts/cache.ts';
import { sha256 } from '../artifacts/files.ts';
import { discoverProject } from '../discovery/project.ts';

export interface WatchOptions { tauriDir: string; outputDir?: string; manifest?: string; header?: string; force?: boolean }

export async function watchExport(platform: 'ios' | 'android', options: WatchOptions): Promise<void> {
  if (options.manifest || options.header) throw new Error('Watch supports ordinary Tauri projects; omit legacy --manifest/--header.');
  const tauriDirectory = path.resolve(options.tauriDir);
  const output = path.resolve(options.outputDir ?? path.join(tauriDirectory, 'gen/tauri-native', platform));
  let project = discoverProject(tauriDirectory);
  console.log(`Watching ${tauriDirectory} for ${platform} exports. Ctrl-C stops after the current export finishes.`);
  await new Promise<void>(resolve => {
    let child: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let stopping = false;
    let observed = ''; let attempted = ''; let changedAt = 0; let lastError = '';
    const finish = () => {
      clearTimeout(timer); process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve();
    };
    const stop = () => {
      if (stopping) return;
      stopping = true; clearTimeout(timer);
      if (child) console.log('Stopping after the current export; no further rebuild will start.');
      else finish();
    };
    const tick = () => {
      if (stopping) return;
      try {
        const fingerprint = sha256(JSON.stringify(exportInputs(project, output)));
        lastError = '';
        if (fingerprint !== observed) { observed = fingerprint; changedAt = Date.now(); }
        if (!child && observed !== attempted && Date.now() - changedAt >= 250) {
          attempted = observed;
          const args = [fileURLToPath(import.meta.url), 'export', platform, '--tauri-dir', tauriDirectory, '--output-dir', output, '--incremental', ...(options.force ? ['--force'] : [])];
          // The bundled module URL is the CLI entry. A separate process leaves
          // input observation responsive while synchronous native tools run.
          child = spawn(process.execPath, args, { stdio: 'inherit', detached: true });
          child.once('error', error => console.error(`Could not start export: ${error.message}`));
          child.once('close', code => {
            child = undefined;
            if (code === 0) {
              console.log(`Artifact ready at ${output}. Copy the complete directory if needed, then rebuild/reinstall the host to load packaged changes.`);
              try { project = discoverProject(tauriDirectory); } catch { /* A subsequent edit may already be incomplete. */ }
            } else console.error('Export failed; the previous artifact is preserved. Waiting for the next edit.');
            if (stopping) finish();
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== lastError) console.error(`Cannot read watch inputs: ${message}`);
        lastError = message;
      }
      timer = setTimeout(tick, 1000);
    };
    process.on('SIGINT', stop); process.on('SIGTERM', stop); tick();
  });
}
