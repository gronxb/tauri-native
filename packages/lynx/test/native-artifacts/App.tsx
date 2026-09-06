import { useEffect, useState } from '@lynx-js/react';
import { TauriView, invoke } from '@tauri-native/lynx';

// Host-owned QA only; the embedded frontend is the same ordinary Tauri export as RN.
export function App() {
  const [status, setStatus] = useState('Running native contract');
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    'background only';
    setStatus('Running native contract');
    async function check() {
      const success = await invoke<{ displayName: string; total: number }>('describe', { request: { displayName: '한글 🦀', values: [2, 3, 5] } });
      if (!success.ok || success.value.displayName !== '한글 🦀' || success.value.total !== 10) throw success;
      const error = await invoke<never, { kind: string; message: string }>('describe', { request: { displayName: '', values: [] } });
      if (error.ok || error.error.kind !== 'empty_name' || error.error.message !== 'A name is required') throw error;
      const greeting = await invoke<string>('greet', { displayName: 'Ada' });
      if (!greeting.ok || greeting.value !== 'Hello, Ada!') throw greeting;
      const unknown = await invoke('unregistered', {}); if (unknown.ok) throw unknown;
      for (const [command, payload] of [['optional', {}], ['optional', { displayName: null }], ['nothing', {}]] as const) {
        const result = await invoke(command, payload); if (!result.ok || result.value !== null) throw result;
      }
      const selection = await invoke<{ type: string; data: string }>('select', { selection: { type: 'display-name', data: '한글' } });
      if (!selection.ok || selection.value.type !== 'display-name' || selection.value.data !== '한글') throw selection;
      setStatus('Native contract passed: 8 cases');
    }
    check().catch(error => setStatus(`Native contract FAILED: ${JSON.stringify(error)}`));
  }, [mounted]);
  return <view style={{ width: '100%', height: '100%', backgroundColor: 'white', paddingTop: '24px' }}>
    <text flatten={false} accessibility-element={true} accessibility-label={status} style={{ color: 'black', fontSize: '18px', padding: '12px' }}>{status}</text>
    <view flatten={false} accessibility-element={true} accessibility-label={mounted ? 'Unmount embedded view' : 'Mount embedded view'}
      style={{ padding: '16px', backgroundColor: '#eeeeee' }} bindtap={() => { 'background only'; setMounted(value => !value); }}>
      <text>{mounted ? 'Unmount embedded view' : 'Mount embedded view'}</text>
    </view>
    {mounted && <TauriView style={{ width: '100%', height: '500px' }} />}
  </view>;
}
