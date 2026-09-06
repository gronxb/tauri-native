// Test-only DOM driver, added to a temporary desktop copy of the ordinary app.
import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';

const phase = '__PHASE__';
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function until(check) {
  const end = Date.now() + 15000;
  while (!check()) {
    if (Date.now() >= end) throw new Error(`Timed out: ${document.querySelector('#status').textContent}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
async function run() {
  await until(() => !document.querySelector('#status').textContent.includes('Opening') && !document.querySelector('#status').textContent.includes('Searching'));
  if (phase === 'save') {
    document.querySelector('#title').value = 'Travel';
    document.querySelector('#body').value = 'Visit 서울 🦀 in AUTUMN.';
    document.querySelector('#editor').requestSubmit();
    await until(() => document.querySelector('#status').textContent === 'Saved “Travel”');
  }
  document.querySelector('#query').value = 'autumn';
  document.querySelector('#search-form').requestSubmit();
  await until(() => document.querySelector('#status').textContent === '1 document found');
  check(document.querySelector('.document strong').textContent === 'Travel', 'saved title');
  check(document.querySelector('.document span').textContent === 'Visit 서울 🦀 in AUTUMN.', 'saved body');
  document.querySelector('.document').click();
  check(document.querySelector('#body').value === 'Visit 서울 🦀 in AUTUMN.', 'open saved document');
  document.querySelector('#title').value = ' ';
  document.querySelector('#editor').requestSubmit();
  await until(() => document.querySelector('#status').textContent.startsWith('Could not save:'));
  const validation = document.querySelector('#status').textContent;
  check(validation === 'Could not save: __TITLE_VERB__ a title between 1 and 120 characters.', 'ordinary Result error visible');
  return { passed: true, phase, directory: await appDataDir(), savedTitle: 'Travel', bodySearch: true, validationVisible: true, validation };
}
run().catch(error => ({ passed: false, phase, error: String(error) }))
  .then(report => invoke('qa_record', { report: JSON.stringify(report) }));
