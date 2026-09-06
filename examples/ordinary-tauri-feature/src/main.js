import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import './style.css';

const title = document.querySelector('#title');
const body = document.querySelector('#body');
const query = document.querySelector('#query');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
// Keep documents in the application's private data directory.
const directory = appDataDir();
let searchVersion = 0;

async function search() {
  const version = ++searchVersion;
  status.textContent = 'Searching…';
  try {
    const documents = await invoke('search_documents', { directory: await directory, query: query.value });
    if (version !== searchVersion) return false;
    results.replaceChildren();
    for (const saved of documents) {
      const entry = document.createElement('button');
      entry.className = 'document';
      const heading = document.createElement('strong');
      heading.textContent = saved.title;
      const excerpt = document.createElement('span');
      excerpt.textContent = saved.body;
      entry.append(heading, excerpt);
      entry.onclick = () => { title.value = saved.title; body.value = saved.body; title.focus(); };
      results.append(entry);
    }
    status.textContent = documents.length ? `${documents.length} document${documents.length === 1 ? '' : 's'} found` : query.value.trim() ? 'No matching documents.' : 'No documents yet. Save your first note above.';
    return true;
  } catch (error) {
    if (version === searchVersion) status.textContent = `Could not search: ${error}`;
    return false;
  }
}

document.querySelector('#editor').onsubmit = async event => {
  event.preventDefault();
  const save = document.querySelector('#save');
  save.disabled = true;
  const version = ++searchVersion;
  try {
    const saved = await invoke('save_document', { directory: await directory, title: title.value, body: body.value });
    if (version !== searchVersion) return;
    if (await search()) status.textContent = `Saved “${saved.title}”`;
  } catch (error) {
    if (version === searchVersion) status.textContent = `Could not save: ${error}`;
  } finally { save.disabled = false; }
};
document.querySelector('#search-form').onsubmit = event => { event.preventDefault(); search(); };
window.addEventListener('pagehide', () => { ++searchVersion; });
search();
