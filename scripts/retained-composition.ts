import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRetainedArtifacts } from './retained-artifacts.ts';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
function read(root: string, file: string) { return readFileSync(path.join(root, file), 'utf8'); }
function write(root: string, file: string, bytes: string | Buffer) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), bytes);
}

/** Shared output ownership for independent RN and Lynx packages; no producer mutation. */
export function prepareComposition(options: { artifactsDir: string; outputDir: string; bundleFile: string; layout?: 'native-project' }, platform: 'android' | 'ios', renderer: 'react-native' | 'lynx', sdkDirectory: string) {
  const fail = (message: string): never => { throw new Error(`Retained ${renderer === 'react-native' ? 'RN' : 'Lynx'} composition: ${message}`); };
  const artifact = realpathSync(options.artifactsDir), bundle = realpathSync(options.bundleFile), sdk = realpathSync(sdkDirectory);
  const requestedOutput = path.resolve(options.outputDir);
  const output = path.join(realpathSync(path.dirname(requestedOutput)), path.basename(requestedOutput));
  const overlaps = (a: string, b: string) => a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
  if ([artifact, sdk].some(input => overlaps(output, input)) || bundle === output || bundle.startsWith(output + path.sep))
    fail('output must be separate from the artifact and SDK, and must not contain the renderer or bundle');
  const manifest = readRetainedArtifacts(artifact);
  if (manifest.platform !== platform) fail(`requires an ${platform} format 2 artifact`);
  if (options.layout !== undefined && options.layout !== 'native-project') fail('unsupported output layout');
  const layout = options.layout;
  if (layout && renderer !== 'react-native') fail('native-project output requires RN composition');
  return { artifact, bundle, sdk, output, project: layout ? output : path.join(output, platform), layout, manifest, bundled: readFileSync(bundle), renderer, fail };
}

function inventory(root: string, fail: (message: string) => never, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, inventory(root, fail, file));
    else if (entry.isFile()) result[file] = hash(readFileSync(path.join(root, file)));
    else fail(`generated path must be regular: ${file}`);
  }
  return result;
}

export function publishComposition(context: ReturnType<typeof prepareComposition>, metadata: Record<string, string>, generate: (stage: string) => void) {
  const { artifact, bundle, bundled, output, layout, manifest, renderer, fail } = context;
  const receiptPath = 'tauri-native-composition.json';
  let previous: { files: Record<string, string> } | undefined;
  if (existsSync(output)) {
    if (!lstatSync(output).isDirectory() || !existsSync(path.join(output, receiptPath)) || !lstatSync(path.join(output, receiptPath)).isFile()) fail('existing output is not an owned composition directory');
    const value = JSON.parse(read(output, receiptPath));
    if (value.formatVersion !== 1 || value.renderer !== renderer || (value.platform ?? 'android') !== manifest.platform || value.layout !== layout || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) fail('invalid prior composition receipt');
    previous = value;
    for (const [file, digest] of Object.entries(previous!.files)) {
      if (!file || file.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\0]/.test(file) || !/^[a-f0-9]{64}$/.test(digest)) fail('invalid prior composition file receipt');
      const target = path.join(output, file);
      // Check ancestors as well: never follow a replaced directory into unrelated files.
      let cursor = output;
      for (const part of file.split('/')) { cursor = path.join(cursor, part); if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) fail(`generated file removed or linked: ${file}`); }
      if (!lstatSync(target).isFile() || hash(readFileSync(target)) !== digest) fail(`generated file changed: ${file}; preserve the edit before regenerating`);
    }
  }
  const work = mkdtempSync(path.join(path.dirname(output), renderer === 'react-native' ? '.tauri-react-compose-' : '.tauri-lynx-compose-'));
  let stage = path.join(work, 'next');
  const backup = path.join(work, 'previous');
  let published = false;
  try {
    mkdirSync(stage); cpSync(path.join(artifact, manifest.platform), path.join(stage, manifest.platform), { recursive: true });
    generate(stage);
    if (layout) stage = path.join(stage, manifest.platform);
    const files = inventory(stage, fail);
    const receipt = JSON.stringify({ formatVersion: 1, renderer, artifact: hash(readFileSync(path.join(artifact, 'manifest.json'))), ...metadata, ...(layout ? { layout } : {}), files }, null, 2) + '\n';
    write(stage, receiptPath, receipt);
    // Revalidate inputs before publication. A changed export can never produce a partial consumer.
    if (JSON.stringify(readRetainedArtifacts(artifact)) !== JSON.stringify(manifest) || !readFileSync(bundle).equals(bundled)) fail('inputs changed during composition');
    if (previous && read(output, receiptPath) === receipt) return false;
    if (previous) {
      // Preserve build outputs and unrelated consumer files; refuse collisions with newly generated files.
      const merged = path.join(work, 'merged'); cpSync(output, merged, { recursive: true });
      for (const file of Object.keys(previous.files)) rmSync(path.join(merged, file));
      rmSync(path.join(merged, receiptPath));
      for (const file of Object.keys(files)) {
        let cursor = merged;
        for (const part of file.split('/')) {
          cursor = path.join(cursor, part);
          let entry;
          try { entry = lstatSync(cursor); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error; }
          if (entry.isSymbolicLink() || !entry.isDirectory()) fail(`new generated file conflicts with consumer file: ${file}`);
        }
      }
      cpSync(stage, merged, { recursive: true }); rmSync(stage, { recursive: true }); renameSync(merged, stage);
      renameSync(output, backup);
      try { renameSync(stage, output); }
      catch (error) {
        try { renameSync(backup, output); }
        catch (restoreError) { throw new AggregateError([error, restoreError], `Composition replacement and rollback failed; previous output preserved at ${backup}`); }
        throw error;
      }
    } else renameSync(stage, output);
    published = true;
    return true;
  } finally {
    // A failed rollback must never erase the only remaining copy of the previous consumer.
    if (published || !existsSync(backup)) rmSync(work, { recursive: true, force: true });
  }
}
