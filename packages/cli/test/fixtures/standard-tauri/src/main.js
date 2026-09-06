import { invoke } from '@tauri-apps/api/core';

const results = {};
try {
  results.success = await invoke('describe', {
    request: { displayName: '한글 🦀', values: [2, 3, 5] },
  });
  try {
    await invoke('describe', { request: { displayName: '', values: [] } });
  } catch (error) {
    results.error = error;
  }
  results.camelCase = await invoke('greet', { displayName: 'Ada' });
  try {
    await invoke('unregistered');
  } catch {
    results.unregisteredRejected = true;
  }
  document.querySelector('#result').textContent = JSON.stringify(results);
} catch (error) {
  document.querySelector('#result').textContent = JSON.stringify({ fatal: String(error) });
}
