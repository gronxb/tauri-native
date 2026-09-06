import { useEffect, useRef, useState } from '@lynx-js/react';
import { appDataDir, invoke, TauriView } from '@tauri-native/lynx';
import { createCommands } from '../tauri-native/commands';
import './App.css';

const command = createCommands(invoke);

export function App() {
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
    'background only';
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
    'background only';
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
  const button = (label: string, action: () => void) => <view className="button" flatten={false} accessibility-element={true} accessibility-label={label} bindtap={action}><text className="buttonText">{label}</text></view>;
  return <view className="page">
    {notebook ? <>
      <view className="navigation">{button('Back to library', () => { 'background only'; setNotebook(false); })}</view>
      {viewError ? <text flatten={false} accessibility-element={true} accessibility-label={viewError} className="status">{viewError}</text> : null}
      <TauriView className="notebook" onLoadError={error => setViewError(error.message)} />
    </> : <scroll-view className="scroll" scroll-orientation="vertical" enable-scroll={true}>
      <view className="content">
        <text className="eyebrow">ON THIS DEVICE</text>
        <text flatten={false} accessibility-element={true} accessibility-label="Your library" className="heading">Your library</text>
        <text className="description">Capture a note here, or open your full notebook.</text>
        {button('Open notebook', () => { 'background only'; cancel(); setStatus('Notes stay on this device.'); setViewError(''); setNotebook(true); })}
        <text className="label">Title</text>
        <input className="input" maxlength={120} default-value={title} accessibility-element={true} accessibility-label="Native document title" bindinput={event => { 'background only'; setTitle(event.detail.value); }} />
        <text className="label">Quick capture</text>
        <input className="input" maxlength={65536} default-value={body} placeholder="Something worth keeping" accessibility-element={true} accessibility-label="Native document text" bindinput={event => { 'background only'; setBody(event.detail.value); }} />
        {button('Save quick note', save)}
        <text flatten={false} accessibility-element={true} accessibility-label={status} className="status">{status}</text>
        <text className="label">Find saved text</text>
        <input className="input" default-value={query} accessibility-element={true} accessibility-label="Native search query" bindinput={event => { 'background only'; setQuery(event.detail.value); }} />
        {button('Search library', search)}
        {documents.map(saved => <view key={saved.title} className="document">
          <text flatten={false} accessibility-element={true} accessibility-label={saved.title} className="documentTitle">{saved.title}</text><text flatten={false} accessibility-element={true} accessibility-label={saved.body} className="description">{saved.body}</text>
        </view>)}
      </view>
    </scroll-view>}
  </view>;
}
