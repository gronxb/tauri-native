import { useEffect, useMemo, useState } from '@lynx-js/react';
import { TauriView, invoke, invokeSync } from '@tauri-native/lynx';
import { asyncContract } from './async-contract';

export function App() {
  const [status, setStatus] = useState('Checking native async commands');
  const [mounted, setMounted] = useState(false);
  const contract = useMemo(() => asyncContract(invoke, invokeSync, setStatus), []);
  const run = (operation: () => Promise<void>) => { 'background only'; operation().catch(error => setStatus(`FAILED: ${error.message}`)); };
  useEffect(() => { 'background only'; run(async () => { await contract.check(); setMounted(true); }); }, []);
  const button = (label: string, action: () => void) => <view flatten={false} accessibility-element={true} accessibility-label={label} bindtap={action} style={{ padding: '8px', backgroundColor: '#eee', margin: '2px' }}><text style={{ color: 'black' }}>{label}</text></view>;
  return <view style={{ width: '100%', height: '100%', paddingTop: '24px', paddingBottom: '52px', backgroundColor: 'white' }}>
    <text flatten={false} accessibility-element={true} accessibility-label={status} style={{ color: 'black', padding: '8px' }}>{status}</text>
    <view style={{ display: 'flex', flexDirection: 'row' }}>
      {button('Start native work', () => { 'background only'; run(contract.startUi); })}
      {button('Pulse native', () => { 'background only'; contract.pulse(); })}
      {button('Cancel native', () => { 'background only'; contract.cancelUi(); })}
    </view>
    {button(mounted ? 'Unmount embedded view' : 'Mount embedded view', () => {
      'background only';
      if (mounted) run(contract.retiredFrontend);
      setMounted(value => !value);
    })}
    {button('Start runtime work', () => { 'background only'; run(contract.startRuntime); })}
    {mounted && <TauriView style={{ width: '100%', height: '450px' }} />}
  </view>;
}
