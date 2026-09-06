(() => {
  let documentId;
  let nextId = 1;
  let active = false;
  let timer;
  let polling = false;
  const pending = new Map();
  const post = (message) => __TAURI_NATIVE_POST_MESSAGE__;
  const send = (message) => post({ ...message, document: documentId });
  const error = (code) => Object.assign(new Error(code), { code });

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
  };
  window.__RNTauriResume = () => {
    if (active) return;
    documentId = String(Date.now()) + ':' + String(Math.random());
    active = true;
    send({ type: 'open' });
  };
  window.addEventListener('pagehide', window.__RNTauriSuspend);
  window.addEventListener('pageshow', window.__RNTauriResume);
  window.__RNTauriResume();
  window.__TAURI_NATIVE_HOST__ = '__TAURI_NATIVE_HOST__';
  globalThis.isTauri = true;
  const internals = window.__TAURI_INTERNALS__ || {};
  internals.invoke = (command, payload) => new Promise((resolve, reject) => {
    if (!active) { reject(error('closed_document')); return; }
    const id = String(nextId++);
    pending.set(id, { resolve, reject });
    try {
      send({ type: 'invoke', id, command, payload: payload ?? {} });
      schedule();
    } catch (cause) { finish(id, undefined, cause); }
  });
  window.__TAURI_INTERNALS__ = internals;
})();
