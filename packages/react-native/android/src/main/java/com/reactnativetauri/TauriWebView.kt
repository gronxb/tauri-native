package com.reactnativetauri

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.IOException

@SuppressLint("SetJavaScriptEnabled")
internal class TauriWebView(context: Context) : WebView(context) {
  private val bridge = TauriJavascriptBridge(this)
  private val state = TauriViewState(this, bridge)

  fun setLocalPath(value: String?) { state.setPath(value) }
  fun sendMessage(value: String?) { state.sendMessage(value) }
  fun setStateListener(listener: TauriViewState.Listener) { state.listener = listener }

  init {
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.setSupportZoom(false)
    settings.builtInZoomControls = false
    settings.displayZoomControls = false
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW

    addJavascriptInterface(bridge, BRIDGE_NAME)
    webViewClient = AssetWebViewClient(context, state)
  }

  override fun onDetachedFromWindow() {
    state.detached()
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    state.load()
  }

  override fun destroy() {
    state.detached()
    state.listener = null
    bridge.destroy()
    removeJavascriptInterface(BRIDGE_NAME)
    super.destroy()
  }

  private class AssetWebViewClient(
    private val context: Context,
    private val state: TauriViewState,
  ) : WebViewClient() {
    override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) { state.started(url) }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
      state.error(state.generation(), request.url.toString(), "navigation_failed", error.description.toString(), request.isForMainFrame)
    }

    private fun block(url: Uri): Boolean {
      if (isAssetUrl(url)) return false
      state.error(state.generation(), url.toString(), "blocked_navigation", "Navigation must stay inside the packaged origin", false)
      return true
    }
    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean = block(request.url)

    @Deprecated("Deprecated in Java")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
      block(Uri.parse(url))

    override fun shouldInterceptRequest(
      view: WebView,
      request: WebResourceRequest,
    ): WebResourceResponse = assetResponse(request.url, request.isForMainFrame)

    @Deprecated("Deprecated in Java")
    override fun shouldInterceptRequest(
      view: WebView,
      url: String,
    ): WebResourceResponse = assetResponse(Uri.parse(url))

    private fun assetResponse(url: Uri, mainFrame: Boolean = false): WebResourceResponse {
      val generation = state.generation()
      fun failure(status: Int, reason: String): WebResourceResponse {
        state.error(generation, url.toString(), "asset_missing", reason, mainFrame)
        return errorResponse(status, reason)
      }
      if (!isAssetUrl(url)) {
        return failure(403, "Blocked")
      }

      val relativePath = url.path.orEmpty()
        .removePrefix("/")
        .ifEmpty { "index.html" }
      if (relativePath.split('/').any { it == "." || it == ".." }) {
        return failure(403, "Blocked")
      }

      return try {
        WebResourceResponse(
          mimeType(relativePath),
          "UTF-8",
          if (mimeType(relativePath) == "text/html") {
            val html = context.assets.open("$ASSET_DIRECTORY/$relativePath").bufferedReader().use { it.readText() }
            ByteArrayInputStream(bridgeDocument(html).toByteArray(Charsets.UTF_8))
          } else context.assets.open("$ASSET_DIRECTORY/$relativePath"),
        )
      } catch (_: IOException) {
        failure(404, "Not Found")
      }
    }

    private fun errorResponse(status: Int, reason: String) =
      WebResourceResponse(
        "text/plain",
        "UTF-8",
        status,
        reason,
        emptyMap(),
        ByteArrayInputStream(reason.toByteArray()),
      )

    private fun mimeType(path: String): String = when (
      path.substringAfterLast('.', "").lowercase()
    ) {
      "css" -> "text/css"
      "html" -> "text/html"
      "js", "mjs" -> "text/javascript"
      "json" -> "application/json"
      "png" -> "image/png"
      "svg" -> "image/svg+xml"
      "wasm" -> "application/wasm"
      "woff" -> "font/woff"
      "woff2" -> "font/woff2"
      else -> "application/octet-stream"
    }
  }

  companion object {
    const val BRIDGE_NAME = "TauriNativeBridge"
    private const val ASSET_DIRECTORY = "tauri-native"
    private const val BRIDGE_SOURCE = """
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
      const post = (message) => window.TauriNativeBridge.postMessage(JSON.stringify(message));
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
      window.__TAURI_NATIVE_HOST__ = "react-native";
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
        if (command.startsWith('plugin:path|') && (command !== 'plugin:path|resolve_directory' || !payload || Object.keys(payload).length !== 1 || payload.directory !== 14)) {
          reject(error('unsupported_path_operation')); return;
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
    """

    private fun bridgeDocument(html: String): String {
      val bridgeScript = "<script>$BRIDGE_SOURCE</script>"
      val headStart = html.indexOf("<head", ignoreCase = true)
      val headEnd = if (headStart >= 0) html.indexOf('>', headStart) else -1
      return if (headEnd >= 0) {
        html.substring(0, headEnd + 1) + bridgeScript + html.substring(headEnd + 1)
      } else {
        bridgeScript + html
      }
    }

    private fun isAssetUrl(url: Uri): Boolean =
      url.scheme == "https" && url.host == "tauri-native.local"
  }
}
