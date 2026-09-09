import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function replaceOnce(source: string, pattern: RegExp, replacement: string, description: string) {
  const matches = source.match(new RegExp(pattern.source, pattern.flags + 'g'));
  if (matches?.length !== 1) throw new Error(`Unsupported Android integration: expected one ${description}.`);
  return source.replace(pattern, replacement);
}

/** Capture the built Tauri bootstrap and native plugin projects without Rust build tasks. */
export function copyAndroidRuntimeProject(native: string, destination: string) {
  if (existsSync(destination)) throw new Error('Capture Android runtime into a new staging directory.');
  const generated = readFileSync(path.join(native, 'tauri.settings.gradle'), 'utf8');
  const modules = [...generated.matchAll(/^project\(':(tauri-[a-z0-9-]+)'\)\.projectDir = new File\(("(?:[^"\\]|\\.)*")\)$/gm)]
    .map(match => ({ name: match[1]!, directory: JSON.parse(match[2]!) as string }));
  if (!modules.some(module => module.name === 'tauri-android') || new Set(modules.map(module => module.name)).size !== modules.length ||
      generated.split('\n').filter(line => line.startsWith('project(')).length !== modules.length ||
      generated.split('\n').some(line => line.trim() && !line.startsWith('//') &&
        !/^include ':tauri-[a-z0-9-]+'$/.test(line) && !modules.some(module => line.startsWith(`project(':${module.name}').projectDir = `)))) {
    throw new Error('Unsupported Tauri native dependency declarations in tauri.settings.gradle.');
  }
  const supported = new Set(['tauri-android', 'tauri-plugin-geolocation', 'tauri-plugin-deep-link']);
  for (const module of modules) if (!supported.has(module.name)) {
    throw new Error(`Retained Android export needs native dependency compatibility evidence for ${module.name}.`);
  }
  let app = readFileSync(path.join(native, 'app/build.gradle.kts'), 'utf8');
  app = replaceOnce(app, /^\s*id\("rust"\)\n/m, '', 'standard Tauri Rust Gradle plugin');
  app = replaceOnce(app, /\nrust \{\n\s*rootDirRel = "\.\.\/\.\.\/\.\.\/"\n\}\n/, '\n', 'standard Tauri Rust build configuration');

  const omitted = new Set(['.git', '.gradle', '.kotlin', '.idea', '.tauri', 'build', 'buildSrc', 'local.properties',
    'app/build', 'app/.cxx', 'app/src/test', 'app/src/androidTest']);
  cpSync(native, destination, { recursive: true, dereference: true,
    filter: source => !omitted.has(path.relative(native, source).split(path.sep).join('/')) });
  writeFileSync(path.join(destination, 'app/build.gradle.kts'), app);
  const clients = readdirSync(path.join(destination, 'app/src/main/java'), { recursive: true, encoding: 'utf8' })
    .filter(file => file.endsWith('/generated/RustWebViewClient.kt'));
  if (clients.length !== 1) throw new Error('Expected one generated Wry Android WebView client.');
  const client = path.join(destination, 'app/src/main/java', clients[0]!);
  // Wry's first document can invoke before onPageStarted updates currentUrl.
  // Record the real main-frame request only after Tauri supplies its response,
  // before that response can execute JS. Subresources and unhandled requests
  // cannot set this context; no local URL or ACL grant is synthesized.
  let clientSource = replaceOnce(readFileSync(client, 'utf8'),
    /^    var currentUrl: String = "about:blank"$/m, '    @Volatile var currentUrl: String = "about:blank"', 'verified Wry 0.55.1 current URL field');
  clientSource = replaceOnce(clientSource, /^            if \(response != null\) \{$/m,
    `            if (response != null) {
                if (request.isForMainFrame && currentUrl == "about:blank") {
                    currentUrl = request.url.toString()
                }`, 'Tauri protocol response before initial document execution');
  writeFileSync(client, clientSource);
  const dependencies = path.join(destination, 'native-dependencies');
  mkdirSync(dependencies);
  for (const module of modules) {
    cpSync(module.directory, path.join(dependencies, module.name), { recursive: true, dereference: true,
      filter: source => !omitted.has(path.relative(module.directory, source).split(path.sep).join('/')) &&
        !['src/test', 'src/androidTest'].includes(path.relative(module.directory, source).split(path.sep).join('/')) });
  }
  writeFileSync(path.join(destination, 'tauri.settings.gradle'), modules.map(module =>
    `include ':${module.name}'\nproject(':${module.name}').projectDir = new File(rootDir, "native-dependencies/${module.name}")\n`).join(''));
  const libraries = path.join(destination, 'app/src/main/jniLibs');
  if (!existsSync(libraries) || !readdirSync(libraries, { recursive: true }).some(file => String(file).endsWith('.so'))) {
    throw new Error('Retained Android export requires built JNI libraries before capture.');
  }
  // Native sources and Gradle declarations must not reach back into the producer
  // or Cargo registry. Compiled ELF validation belongs to the export gate.
  const previousPaths = [native, ...modules.map(module => module.directory)];
  for (const relative of readdirSync(destination, { recursive: true, encoding: 'utf8' })) {
    if (!/\.(?:gradle|kts|kt|java|xml|properties|json|pro)$/.test(relative)) continue;
    const text = readFileSync(path.join(destination, relative), 'utf8');
    if (previousPaths.some(previous => text.includes(previous))) throw new Error(`Native build input retains a source path: ${relative}`);
  }
  return { modules: modules.map(module => module.name) };
}
