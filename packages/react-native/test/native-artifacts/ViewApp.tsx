import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { TauriView } from '@tauri-native/react-native';
import { initialViewState, viewContract } from './view-contract';

export default function App() {
  const [state, setState] = useState(initialViewState);
  const contract = useMemo(() => viewContract(setState), []);
  const button = (label: string, action: () => void) => <Pressable accessibilityLabel={label} onPress={action} style={{ padding: 6, backgroundColor: '#eee', margin: 2 }}><Text style={{ color: 'black' }}>{label}</Text></Pressable>;
  return <View style={{ flex: 1, paddingTop: 60, paddingBottom: 52, backgroundColor: 'white' }}>
    {(['left', 'right'] as const).map(side => <Text key={side} style={{ color: 'black' }}>{`${side} host: ${state[side].starts}/${state[side].ready} replies ${state[side].replies} ${state[side].last} error ${state[side].error}`}</Text>)}
    <Text style={{ color: 'black' }}>{state.failure || 'Host checks OK'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {button('Send left', () => contract.send('left'))}
      {button('Send right', () => contract.send('right'))}
      {button('Same left id', () => contract.send('left', true))}
      {button('Next document', () => contract.navigate('/index.html?documentId=next#fresh'))}
      {button('Missing document', () => contract.navigate('/missing.html'))}
      {button('Invalid path', () => contract.navigate('https://example.com'))}
      {button(state.left.mounted ? 'Unmount left' : 'Mount left', contract.toggle)}
    </View>
    {state.left.mounted && <TauriView {...contract.options('left')} style={{ flex: 1 }} />}
    <TauriView {...contract.options('right')} style={{ flex: 1 }} />
  </View>;
}
