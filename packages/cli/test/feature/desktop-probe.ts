// Test-only DOM driver, added to a temporary desktop copy of the ordinary app.
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';

const phase: string = '__PHASE__';
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function until(check: () => boolean) {
  const end = Date.now() + 15000;
  while (!check()) {
    if (Date.now() >= end) throw new Error(`Timed out: ${document.querySelector<HTMLElement>('#status')!.textContent}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
async function run() {
  await until(() => !document.querySelector<HTMLElement>('#status')!.textContent!.includes('Opening') && !document.querySelector<HTMLElement>('#status')!.textContent!.includes('Searching'));
  if (phase === 'save') {
    document.querySelector<HTMLInputElement>('#title')!.value = 'Travel';
    document.querySelector<HTMLTextAreaElement>('#body')!.value = 'Visit 서울 🦀 in AUTUMN.';
    document.querySelector<HTMLFormElement>('#editor')!.requestSubmit();
    await until(() => document.querySelector<HTMLElement>('#status')!.textContent === 'Saved “Travel”');
  }
  document.querySelector<HTMLInputElement>('#query')!.value = 'autumn';
  document.querySelector<HTMLFormElement>('#search-form')!.requestSubmit();
  await until(() => document.querySelector<HTMLElement>('#status')!.textContent === '1 document found');
  check(document.querySelector<HTMLElement>('.document strong')!.textContent === 'Travel', 'saved title');
  check(document.querySelector<HTMLElement>('.document span')!.textContent === 'Visit 서울 🦀 in AUTUMN.', 'saved body');
  document.querySelector<HTMLElement>('.document')!.click();
  check(document.querySelector<HTMLTextAreaElement>('#body')!.value === 'Visit 서울 🦀 in AUTUMN.', 'open saved document');
  document.querySelector<HTMLInputElement>('#title')!.value = ' ';
  document.querySelector<HTMLFormElement>('#editor')!.requestSubmit();
  await until(() => document.querySelector<HTMLElement>('#status')!.textContent!.startsWith('Could not save:'));
  const validation = document.querySelector<HTMLElement>('#status')!.textContent;
  check(validation === 'Could not save: __TITLE_VERB__ a title between 1 and 120 characters.', 'ordinary Result error visible');
  return { passed: true, phase, directory: await appDataDir(), savedTitle: 'Travel', bodySearch: true, validationVisible: true, validation };
}
run().catch(error => ({ passed: false, phase, error: String(error) }))
  .then(report => invoke('qa_record', { report: JSON.stringify(report) }));
