(() => {
  let documentId;
  let nextId = 1;
  let active = false;
  let timer;
  let polling = false;
  const pending = new Map();
  const eventCallbacks = new Map();
  const eventListeners = new Map();
  let nextCallback = 1;
  let nextListener = 1;
  let readySent = false;
  const post = (message) => __TAURI_NATIVE_POST_MESSAGE__;
  const send = (message) => post({ ...message, document: documentId });
  const error = (code) => Object.assign(new Error(code), { code });
  function reportReady() {
    if (!active || readySent) return;
    readySent = true;
    send({ type: 'ready' });
  }
  window.addEventListener('load', reportReady);

  function schedule() {
    if (!active || !pending.size || timer !== undefined || polling) return;
    timer = setTimeout(() => {
      timer = undefined;
      polling = true;
      try { send({ type: 'poll' }); } catch (cause) { failAll(cause); }
    }, 16);
  }

  function finish(id, responseJson, cause) {
    const callbacks = pending.get(id);
    if (!callbacks) return;
    pending.delete(id);
    try {
      if (cause) throw cause;
      const response = JSON.parse(responseJson);
      if (response?.abiVersion === undefined) callbacks.resolve(response);
      else {
        if (![1, 2].includes(response.abiVersion) || typeof response.ok !== 'boolean' || !((response.ok ? 'value' : 'error') in response)) throw error('invalid_response');
        response.ok ? callbacks.resolve(response.value) : callbacks.reject(response.error);
      }
    } catch (cause) { callbacks.reject(cause); }
    if (!pending.size) {
      clearTimeout(timer); timer = undefined; polling = false;
      try { send({ type: 'close' }); } catch {}
    }
  }

  function failAll(cause) {
    for (const id of [...pending.keys()]) finish(id, undefined, cause);
  }

  window.__RNTauriResolve = (document, id, responseJson, failure) => {
    if (active && document === documentId) finish(id, responseJson, failure ? error(failure) : undefined);
  };
  window.__RNTauriDrain = (document, responseJson) => {
    if (!active || document !== documentId) return;
    polling = false;
    try {
      const batch = JSON.parse(responseJson);
      if (!Array.isArray(batch)) throw error(batch?.error ?? 'invalid_response');
      for (const item of batch) finish(item.id, item.response);
    } catch (cause) { failAll(cause); }
    schedule();
  };
  window.__RNTauriSuspend = () => {
    if (!active) return;
    failAll(Object.assign(error('closed_document'), { name: 'AbortError' }));
    try { send({ type: 'close' }); } catch {}
    active = false;
    eventCallbacks.clear();
    eventListeners.clear();
  };
  window.__RNTauriResume = () => {
    if (active) return;
    documentId = String(Date.now()) + ':' + String(Math.random());
    active = true;
    readySent = false;
    send({ type: 'open' });
    if (window.document?.readyState === 'complete') Promise.resolve().then(reportReady);
  };
  window.addEventListener('pagehide', window.__RNTauriSuspend);
  window.addEventListener('pageshow', window.__RNTauriResume);
  window.__RNTauriResume();
  window.__TAURI_NATIVE_HOST__ = '__TAURI_NATIVE_HOST__';
  globalThis.isTauri = true;
  const internals = window.__TAURI_INTERNALS__ || {};
  internals.transformCallback = (callback, once = false) => {
    if (!active) throw error('closed_document');
    if (eventCallbacks.size >= 64) throw error('event_listener_limit');
    const id = nextCallback++;
    eventCallbacks.set(id, { callback, once });
    return id;
  };
  internals.unregisterCallback = (id) => eventCallbacks.delete(id);
  const unlisten = (event, id) => {
    const listener = eventListeners.get(id);
    if (listener?.event !== event) return;
    eventCallbacks.delete(listener.handler);
    eventListeners.delete(id);
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: unlisten };
  const validEvent = (event) => {
    if (typeof event !== 'string' || !/^[a-zA-Z0-9/:_-]*$/.test(event)) throw error('unsupported_event_name');
    if (event.startsWith('tauri://')) throw error('unsupported_system_event');
  };
  const validTarget = (target) => {
    if (target?.kind !== 'Webview' || target.label !== 'main') throw error('unsupported_event_target: only Webview main is supported');
  };
  const dispatchEvent = (event, payload) => {
    // Delivery is asynchronous, like Tauri's scheduled WebView evaluation.
    const document = documentId;
    const ids = [...eventListeners].filter(([, listener]) => listener.event === event).map(([id]) => id);
    Promise.resolve().then(() => {
      if (!active || document !== documentId) return;
      for (const id of ids) {
        const listener = eventListeners.get(id);
        const entry = listener && eventCallbacks.get(listener.handler);
        if (!entry) continue;
        if (entry.once) eventCallbacks.delete(listener.handler);
        try { entry.callback({ event, id, payload }); }
        catch (cause) { setTimeout(() => { throw cause; }, 0); }
      }
    });
  };
  window.__RNTauriHostEvent = (document, event, payload) => {
    if (!active || document !== documentId) return 'closed_document';
    try { validEvent(event); dispatchEvent(event, JSON.parse(JSON.stringify(payload ?? null))); return ''; }
    catch (cause) { return cause.message; }
  };
  function invokeEvent(command, payload) {
    try {
      if (!active) throw error('closed_document');
      validEvent(payload.event);
      if (command === 'plugin:event|unlisten') { unlisten(payload.event, payload.eventId); return null; }
      if (command !== 'plugin:event|listen' && command !== 'plugin:event|emit_to') throw error('unsupported_event_operation');
      validTarget(payload.target);
      if (command === 'plugin:event|listen') {
        if (!eventCallbacks.has(payload.handler)) throw error('invalid_event_callback');
        const id = nextListener++;
        eventListeners.set(id, { event: payload.event, handler: payload.handler });
        return id;
      }
      const value = JSON.parse(JSON.stringify(payload.payload ?? null));
      dispatchEvent(payload.event, value);
      send({ type: 'event', event: payload.event, payload: value });
      return null;
    } catch (cause) {
      if (command === 'plugin:event|listen') eventCallbacks.delete(payload.handler);
      throw cause;
    }
  }
  internals.invoke = (command, payload) => new Promise((resolve, reject) => {
    if (!active) { reject(error('closed_document')); return; }
    if (command.startsWith('plugin:event|')) {
      Promise.resolve().then(() => invokeEvent(command, payload ?? {})).then(resolve, reject);
      return;
    }
    const id = String(nextId++);
    pending.set(id, { resolve, reject });
    try {
      send({ type: 'invoke', id, command, payload: payload ?? {} });
      schedule();
    } catch (cause) { finish(id, undefined, cause); }
  });
  window.__TAURI_INTERNALS__ = internals;
})();
