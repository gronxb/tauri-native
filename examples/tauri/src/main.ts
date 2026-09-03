import { invoke } from '@tauri-apps/api/core';

interface Calculation {
  result: number;
  source: 'tauri-native-example-core';
}

type InvokeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

declare global {
  interface Window {
    __TAURI_NATIVE_HOST__?: 'react-native' | 'lynx';
  }
}

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element: ${selector}`);
  return value;
}

window.addEventListener('DOMContentLoaded', () => {
  const form = element<HTMLFormElement>('#calculate-form');
  const input = element<HTMLInputElement>('#expression-input');
  const host = element<HTMLDivElement>('#host');
  const status = element<HTMLParagraphElement>('#status');
  const result = element<HTMLOutputElement>('#calculation-result');
  const resultPanel = element<HTMLElement>('.result');
  const source = element<HTMLElement>('#source');
  const hostType = window.__TAURI_NATIVE_HOST__ ?? 'desktop';

  host.textContent =
    hostType === 'react-native'
      ? 'React Native'
      : hostType === 'lynx'
        ? 'Lynx'
        : 'Desktop';
  document.documentElement.dataset.host = hostType;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    input.blur();
    resultPanel.dataset.state = 'running';
    status.textContent = 'Running…';
    result.textContent = '—';
    source.textContent = '';

    let response: InvokeResponse<Calculation>;
    try {
      response = await invoke<InvokeResponse<Calculation>>('calculate', {
        expression: input.value,
      });
    } catch (error) {
      console.error(error);
      resultPanel.dataset.state = 'error';
      status.textContent = 'Bridge unavailable';
      return;
    }

    if (!response.ok) {
      resultPanel.dataset.state = 'error';
      status.textContent = response.error.message;
      return;
    }

    resultPanel.dataset.state = 'success';
    status.textContent = 'Returned from Rust';
    result.textContent = `= ${response.value.result}`;
    source.textContent = response.value.source;
  });
});
