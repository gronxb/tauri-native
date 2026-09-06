import { useMemo, useState } from '@lynx-js/react';
import { TauriView } from '@tauri-native/lynx';
import { initialViewState, viewContract } from './view-contract';

export function App() {
  const [state, setState] = useState(initialViewState);
  const contract = useMemo(() => viewContract(setState), []);
  const text = (label: string) => <text flatten={false} accessibility-element={true} accessibility-label={label} style={{ color: 'black' }}>{label}</text>;
  const button = (label: string, action: () => void) => <view flatten={false} accessibility-element={true} accessibility-label={label} bindtap={action} style={{ padding: '6px', backgroundColor: '#eee', margin: '2px' }}><text style={{ color: 'black' }}>{label}</text></view>;
  return <view style={{ width: '100%', height: '100%', paddingTop: '60px', paddingBottom: '52px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
    {(['left', 'right'] as const).map(side => text(`${side} host: ${state[side].starts}/${state[side].ready} replies ${state[side].replies} ${state[side].last} error ${state[side].error}`))}
    {text(state.failure || 'Host checks OK')}
    {state.left.detail && text(state.left.detail)}
    <view style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
      {button('Send left', () => { 'background only'; contract.send('left'); })}
      {button('Send right', () => { 'background only'; contract.send('right'); })}
      {button('Same left id', () => { 'background only'; contract.send('left', true); })}
      {button('Next document', () => { 'background only'; contract.navigate('/index.html?documentId=next#fresh'); })}
      {button('Missing document', () => { 'background only'; contract.navigate('/missing.html'); })}
      {button('Invalid path', () => { 'background only'; contract.navigate('https://example.com'); })}
      {button(state.left.mounted ? 'Unmount left' : 'Mount left', () => { 'background only'; contract.toggle(); })}
    </view>
    {state.left.mounted && <TauriView {...contract.options('left')} style={{ width: '100%', height: '200px' }} />}
    <TauriView {...contract.options('right')} style={{ width: '100%', height: '200px' }} />
  </view>;
}
