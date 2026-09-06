import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { appDataDir, invoke, TauriView } from '@tauri-native/react-native';
import { createCommands } from '../tauri-native/commands';

const command = createCommands(invoke);

export default function App() {
  const [notebook, setNotebook] = useState(false);
  const [viewError, setViewError] = useState('');
  const [title, setTitle] = useState('Quick note');
  const [body, setBody] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Notes stay on this device.');
  const [documents, setDocuments] = useState<{ title: string; body: string }[]>([]);
  const pending = useRef<{ cancel(): void } | null>(null);
  const generation = useRef(0);
  const cancel = () => { generation.current++; pending.current?.cancel(); pending.current = null; };
  useEffect(() => () => cancel(), []);

  async function search() {
    cancel(); const version = generation.current;
    setStatus('Searching…');
    try {
      const directory = await appDataDir();
      if (generation.current !== version) return;
      const request = command('search_documents', { directory, query });
      pending.current = request;
      const result = await request;
      if (generation.current !== version) return;
      if (!result.ok) throw result.error;
      setDocuments(result.value);
      setStatus(`${result.value.length} saved document${result.value.length === 1 ? '' : 's'}`);
    } catch (error) { if (generation.current === version) setStatus(`Could not search: ${String(error)}`); }
  }
  async function save() {
    cancel(); const version = generation.current;
    try {
      const directory = await appDataDir();
      if (generation.current !== version) return;
      const request = command('save_document', { directory, title, body });
      pending.current = request;
      const result = await request;
      if (generation.current !== version) return;
      if (!result.ok) throw result.error;
      setStatus(`Saved “${result.value.title}”`);
    } catch (error) { if (generation.current === version) setStatus(`Could not save: ${String(error)}`); }
  }
  const button = (label: string, onPress: () => void) => <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <SafeAreaProvider><SafeAreaView style={styles.page}>
    {notebook ? <>
      <View style={styles.navigation}>{button('Back to library', () => setNotebook(false))}</View>
      {viewError ? <Text style={styles.status}>{viewError}</Text> : null}
      <TauriView style={styles.webview} onLoadError={error => setViewError(error.message)} />
    </> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ON THIS DEVICE</Text>
      <Text style={styles.heading}>Your library</Text>
      <Text style={styles.description}>Capture a note here, or open your full notebook.</Text>
      {button('Open notebook', () => { cancel(); setStatus('Notes stay on this device.'); setViewError(''); setNotebook(true); })}
      <Text style={styles.label}>Title</Text>
      <TextInput accessibilityLabel="Native document title" value={title} onChangeText={setTitle} style={styles.input} />
      <Text style={styles.label}>Quick capture</Text>
      <TextInput accessibilityLabel="Native document text" value={body} onChangeText={setBody} style={styles.input} placeholder="Something worth keeping" />
      {button('Save quick note', save)}
      <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
      <Text style={styles.label}>Find saved text</Text>
      <TextInput accessibilityLabel="Native search query" value={query} onChangeText={setQuery} style={styles.input} autoCapitalize="none" returnKeyType="search" onSubmitEditing={search} />
      {button('Search library', search)}
      {documents.map(saved => <View key={saved.title} style={styles.document}>
        <Text style={styles.documentTitle}>{saved.title}</Text><Text style={styles.description}>{saved.body}</Text>
      </View>)}
    </ScrollView>}
  </SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f6f4ee' },
  content: { padding: 20, paddingBottom: 48 },
  navigation: { paddingHorizontal: 20, paddingBottom: 10 },
  eyebrow: { color: '#47684e', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  heading: { fontSize: 30, color: '#242a25', marginVertical: 8, fontWeight: '600' },
  description: { color: '#637064', fontSize: 14, lineHeight: 21 },
  label: { color: '#242a25', fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { color: '#242a25', backgroundColor: '#fffefb', borderColor: '#cbcfc5', borderWidth: 1, borderRadius: 5, padding: 12 },
  button: { backgroundColor: '#345f43', padding: 12, borderRadius: 5, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontSize: 14, fontWeight: '600' },
  status: { color: '#47684e', paddingTop: 16, minHeight: 40, fontSize: 13 },
  document: { borderTopWidth: 1, borderTopColor: '#d5d8ce', marginTop: 16, paddingTop: 12 },
  documentTitle: { color: '#242a25', fontWeight: '600', marginBottom: 5 },
  webview: { flex: 1 },
});
