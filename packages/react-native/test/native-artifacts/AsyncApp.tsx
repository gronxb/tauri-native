import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TauriView, invoke, invokeSync } from '@tauri-native/react-native';
import { asyncContract } from './async-contract';

export default function App() {
  const [status, setStatus] = useState('Checking native async commands');
  const [mounted, setMounted] = useState(false);
  const contract = useMemo(() => asyncContract(invoke, invokeSync, setStatus), []);
  const run = (operation: () => Promise<void>) => { operation().catch(error => setStatus(`FAILED: ${error.message}`)); };
  useEffect(() => { run(async () => { await contract.check(); setMounted(true); }); }, []);
  const button = (label: string, action: () => void) => <Pressable accessibilityLabel={label} onPress={action} style={{ padding: 8, backgroundColor: '#eee', margin: 2 }}><Text style={{ color: 'black' }}>{label}</Text></Pressable>;
  return <View style={{ flex: 1, paddingTop: 60, paddingBottom: 52, backgroundColor: 'white' }}>
    <Text style={{ color: 'black', padding: 8 }}>{status}</Text>
    <View style={{ flexDirection: 'row' }}>
      {button('Start native work', () => run(contract.startUi))}
      {button('Pulse native', contract.pulse)}
      {button('Cancel native', contract.cancelUi)}
    </View>
    {button(mounted ? 'Unmount embedded view' : 'Mount embedded view', () => {
      if (mounted) run(contract.retiredFrontend);
      setMounted(value => !value);
    })}
    {button('Start runtime work', () => run(contract.startRuntime))}
    {mounted && <TauriView style={{ flex: 1 }} />}
  </View>;
}
