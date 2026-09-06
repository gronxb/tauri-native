import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { TauriView, invoke } from '@tauri-native/react-native';

// Host-owned QA screen. The packaged frontend remains the ordinary Tauri fixture.
export default function App() {
  const [status, setStatus] = useState('Running native contract');
  useEffect(() => {
    async function check() {
      const success = await invoke<{ displayName: string; total: number }>('describe', {
        request: { displayName: '한글 🦀', values: [2, 3, 5] },
      });
      if (!success.ok || success.value.displayName !== '한글 🦀' || success.value.total !== 10) throw success;
      const error = await invoke<never, { kind: string; message: string }>('describe', { request: { displayName: '', values: [] } });
      if (error.ok || error.error.kind !== 'empty_name' || error.error.message !== 'A name is required') throw error;
      const greeting = await invoke<string>('greet', { displayName: 'Ada' });
      if (!greeting.ok || greeting.value !== 'Hello, Ada!') throw greeting;
      const unknown = await invoke('unregistered', {});
      if (unknown.ok) throw unknown;
      for (const [command, payload] of [['optional', {}], ['optional', { displayName: null }], ['nothing', {}]] as const) {
        const result = await invoke(command, payload);
        if (!result.ok || result.value !== null) throw result;
      }
      const selection = await invoke<{ type: string; data: string }>('select', { selection: { type: 'display-name', data: '한글' } });
      if (!selection.ok || selection.value.type !== 'display-name' || selection.value.data !== '한글') throw selection;
      setStatus('Native contract passed: 8 cases');
    }
    check().catch(error => setStatus(`Native contract FAILED: ${JSON.stringify(error)}`));
  }, []);
  return <View style={{ flex: 1, paddingTop: 64, backgroundColor: 'white' }}>
    <Text style={{ color: 'black', fontSize: 18, padding: 12 }}>{status}</Text>
    <TauriView style={{ flex: 1 }} />
  </View>;
}
