import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { retainedIosController } from './retained-composition.ts';

test('native dispatch substitution preserves both the Lynx/RN module and Tauri view lifecycle controller', () => {
  for (const [framework, file, controller] of [
    ['lynx', 'LynxProof.m', 'LynxProof'], ['react-native', 'ReactProof.mm', 'ReactProof'],
  ]) {
    const generated = retainedIosController(readFileSync(new URL(`./composition/ios/${file}`, import.meta.url), 'utf8'), framework!);
    for (const preserved of [`@implementation ${controller}\n`, `@implementation ${controller}Module\n`, '- (void)mount {', '- (void)attachWhenReady {']) {
      assert(generated.includes(preserved), preserved);
    }
    assert(generated.includes('[current invoke:@"snapshot"'));
    assert(!generated.includes('evaluateJavaScript:') && !generated.includes('addScriptMessageHandler:'));
  }
});
