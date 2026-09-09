import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProject } from '../../src/discovery/project.ts';
import { prepareRuntime, type NativeCallerPolicy } from '../../src/runtime/workspace.ts';
import { snapshot } from '../native-export/source-integrity.ts';

export const mobileCallerPolicy: NativeCallerPolicy = { version: 1, callers: {
  native: { webview: 'main', commands: ['snapshot', 'plugin:runtime-probe|read', 'plugin:runtime-probe|forbidden'] },
} };

export function prepareRetainedComposition(producer: string, output: string) {
  const before = snapshot(producer);
  const runtime = prepareRuntime(discoverProject('src-tauri', producer, false, 'retained'), mobileCallerPolicy);
  try { cpSync(runtime.directory, output, { recursive: true }); }
  finally { runtime.cleanup(); }
  assert.deepEqual(snapshot(producer), before, 'Runtime integration preserves the ordinary producer');
  return path.join(output, 'producer');
}

export function retainedIosController(source: string, framework: string) {
  const controller = framework === 'lynx' ? 'LynxProof' : 'ReactProof';
  const callback = framework === 'lynx' ? 'LynxCallbackBlock' : 'ProofCallback';
  const replace = (from: string | RegExp, to: string) => {
    const changed = source.replace(from, to);
    assert.notEqual(changed, source, `Missing retained controller integration point: ${from}`);
    source = changed;
  };
  replace(`#import "${controller}.h"`, `#import "${controller}.h"\n#import "TNRuntimeSession.h"`);
  replace(`<WKScriptMessageHandler>`, '');
  replace('@property(nonatomic) NSString *script;', '@property(nonatomic) TNRuntimeSession *runtime;');
  replace(/  NSString \*asset = \[NSBundle.mainBundle pathForResource:@"composition-probe"[\s\S]*?  NSAssert\(active.script, @"Missing composition probe"\);\n/, '');
  replace('  [self.webview.configuration.userContentController addScriptMessageHandler:self name:@"RuntimeProofResult"];\n', '');
  replace('    [self.pending removeAllObjects];', '    [self.pending removeAllObjects];\n    [self.runtime close];\n    self.runtime = nil;');
  replace('  self.generation++;', '  self.runtime = [[TNRuntimeSession alloc] initWithCaller:@"native" error:nil];\n  NSAssert(self.runtime, @"Retained Tauri runtime is not ready");\n  self.generation++;');
  const inspect = readFileSync(fileURLToPath(new URL('./composition/ios/RetainedInspect.m.fixture', import.meta.url)), 'utf8').replaceAll('PROOF_CALLBACK', callback);
  const start = source.lastIndexOf('- (void)inspect:(');
  assert(start > source.indexOf(`@implementation ${controller}\n`), 'Replace the controller method, preserving the renderer module');
  source = source.slice(0, start) + inspect + '\n@end\n';
  assert(!source.includes('evaluateJavaScript:') && !source.includes('addScriptMessageHandler:'), 'Native retained proof must not proxy through frontend JavaScript');
  return source;
}
