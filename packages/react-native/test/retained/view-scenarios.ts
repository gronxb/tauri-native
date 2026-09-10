import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

interface ViewReport {
  pid: number;
  listeners: number;
  generation: number;
  listenersAfterRelease: number;
  view: {
    originalParent: boolean;
    parent: string;
    documentOrigin: number | string;
    documentToken: string;
    navigationDelegateUnchanged: boolean;
    uiDelegateUnchanged: boolean;
    transitions: { parent: string; documentOrigin: number | string; documentToken: string | null; error?: string }[];
  };
}

export function assertOriginalDocument(report: ViewReport, embedded: boolean) {
  assert.equal(report.view.originalParent, !embedded);
  assert.equal(report.view.navigationDelegateUnchanged, true);
  assert.equal(report.view.uiDelegateUnchanged, true);
  assert(Number(report.view.documentOrigin) > 0);
  assert.match(report.view.documentToken, /^[0-9a-f-]{36}$/i);
  assert(report.view.transitions.length > 0);
  assert.equal(report.view.transitions.at(-1)!.parent, report.view.parent);
  for (const transition of report.view.transitions) {
    assert.equal(transition.documentToken, report.view.documentToken, 'Moving a view must not replace or reload the Tauri document');
    assert(!transition.error);
  }
}

/** Identical actual frontend/native command and remount scenarios on both mobile platforms. */
export function verifyRetainedView(flow: (label: string, steps: string) => void, report: () => ViewReport, evidence: string, links: number, events: number) {
  const snapshot = (label: string) => {
    const state = report();
    writeFileSync(path.join(evidence, `view-${label}.json`), JSON.stringify(state, null, 2) + '\n');
    return state;
  };
  flow('embedded-frontend', `- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- tapOn: "Check denied capability"\n- assertVisible: "Tauri capability denied location watch"\n- tapOn: "Save location note"\n- assertVisible: "Saved location note 2"\n- assertVisible: "RN events ${events + 1}"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links ${links} notes 2 setup 1 plugins 1"`);
  const attached = snapshot('attached'); assertOriginalDocument(attached, true); assert.equal(attached.listeners, 1);
  flow('competing-view', `- tapOn: "Add competing view"\n- assertVisible: "Competing view_in_use"\n- tapOn: "Remove competing view"\n- tapOn: "Check location permission"\n- assertVisible: "Location permission granted"`);
  const contended = snapshot('contended'); assertOriginalDocument(contended, true);
  flow('detach-view', `- tapOn: "Hide Tauri view"\n- assertVisible: "View detached"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links ${links} notes 2 setup 1 plugins 1"`);
  const detached = snapshot('detached'); assertOriginalDocument(detached, false); assert.equal(detached.listeners, 1);
  flow('remount-view', `- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- assertVisible: "Location permission granted"\n- swipe:\n    start: "50%,90%"\n    end: "50%,72%"\n    duration: 800\n- tapOn: "Refresh notes and links"\n- assertVisible: "Links received ${links}"`);
  const remounted = snapshot('remounted'); assertOriginalDocument(remounted, true);
  flow('replace-renderer-with-view', `- tapOn: "Reload RN"\n- assertVisible: "Tauri 45 setup 1 plugins 1"\n- assertVisible: "View detached"\n- assertVisible: "RN events 0"\n- tapOn: "Refresh Tauri"\n- assertVisible: "Links ${links} notes 2 setup 1 plugins 1"`);
  const replaced = snapshot('replaced'); assertOriginalDocument(replaced, false);
  assert.equal(replaced.pid, attached.pid); assert.equal(replaced.generation, attached.generation + 1);
  assert.equal(replaced.listenersAfterRelease, 0);
  assert.equal(replaced.listeners, 1);
  flow('attach-before-close', `- tapOn: "Show Tauri view"\n- assertVisible: "View attached"\n- swipe:\n    start: "50%,90%"\n    end: "50%,72%"\n    duration: 800\n- assertVisible: "Links received ${links}"`);
  assertOriginalDocument(snapshot('before-close'), true);
  return { attached, contended, detached, remounted, replaced };
}
