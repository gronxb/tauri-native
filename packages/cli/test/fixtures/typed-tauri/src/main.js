import { invoke } from '@tauri-apps/api/core';

try {
  const value = await invoke('select', { selection: { type: 'display-name', data: 'Shared Rust commands' } });
  document.querySelector('#result').textContent = JSON.stringify(value, null, 2);
} catch (error) {
  document.querySelector('#result').textContent = JSON.stringify(error);
}
