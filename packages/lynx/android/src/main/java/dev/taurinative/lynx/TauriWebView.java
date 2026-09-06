package dev.taurinative.lynx;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

@SuppressLint("SetJavaScriptEnabled")
public final class TauriWebView extends WebView {
  private static final String BRIDGE_NAME = "TauriNativeBridge";
  private static final String ASSET_DIRECTORY = "tauri-native";
  private static final String BRIDGE_SOURCE = """
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
      window.__TAURI_NATIVE_HOST__ = "lynx";
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
    """;

  private final TauriJavascriptBridge bridge;
  private final TauriViewState state;

  public void setLocalPath(String value) { state.setPath(value); }
  public void sendMessage(String value) { state.sendMessage(value); }
  public void setStateListener(TauriViewState.Listener listener) { state.listener = listener; }

  public TauriWebView(Context context) {
    super(context);

    WebSettings webSettings = getSettings();
    webSettings.setJavaScriptEnabled(true);
    webSettings.setDomStorageEnabled(true);
    webSettings.setAllowFileAccess(false);
    webSettings.setAllowContentAccess(false);
    webSettings.setSupportZoom(false);
    webSettings.setBuiltInZoomControls(false);
    webSettings.setDisplayZoomControls(false);
    webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

    bridge = new TauriJavascriptBridge(this);
    state = new TauriViewState(this, bridge);
    addJavascriptInterface(bridge, BRIDGE_NAME);
    setWebViewClient(new AssetWebViewClient(context.getApplicationContext(), state));
  }

  private static String bridgeDocument(String html) {
    String bridgeScript = "<script>" + BRIDGE_SOURCE + "</script>";
    int headStart = html.toLowerCase().indexOf("<head");
    int headEnd = headStart >= 0 ? html.indexOf('>', headStart) : -1;
    return headEnd >= 0
      ? html.substring(0, headEnd + 1) + bridgeScript + html.substring(headEnd + 1)
      : bridgeScript + html;

  }

  private static boolean isAssetUrl(Uri url) {
    return "https".equals(url.getScheme()) && "tauri-native.local".equals(url.getHost());
  }

  @Override
  protected void onDetachedFromWindow() {
    state.detached();
    super.onDetachedFromWindow();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    state.load();
  }

  @Override
  public void destroy() {
    state.detached();
    state.listener = null;
    bridge.destroy();
    removeJavascriptInterface(BRIDGE_NAME);
    super.destroy();
  }

  private static final class AssetWebViewClient extends WebViewClient {
    private final Context context;

    private final TauriViewState state;
    AssetWebViewClient(Context context, TauriViewState state) {
      this.context = context; this.state = state;
    }

    @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) { state.started(url); }
    @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
      state.error(state.generation(), request.getUrl().toString(), "navigation_failed", error.getDescription().toString(), request.isForMainFrame());
    }
    private boolean block(Uri url) {
      if (isAssetUrl(url)) return false;
      state.error(state.generation(), url.toString(), "blocked_navigation", "Navigation must stay inside the packaged origin", false);
      return true;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      return block(request.getUrl());
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
      return block(Uri.parse(url));
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(
      WebView view,
      WebResourceRequest request
    ) {
      return assetResponse(request.getUrl(), request.isForMainFrame());
    }

    @Override
    @SuppressWarnings("deprecation")
    public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
      return assetResponse(Uri.parse(url), false);
    }

    private WebResourceResponse assetResponse(Uri url, boolean mainFrame) {
      int generation = state.generation();
      if (!isAssetUrl(url)) {
        return failure(generation, url, mainFrame, 403, "Blocked");
      }

      String relativePath = url.getPath() == null ? "" : url.getPath();
      relativePath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
      relativePath = relativePath.isEmpty() ? "index.html" : relativePath;
      for (String segment : relativePath.split("/")) {
        if (segment.equals(".") || segment.equals("..")) {
          return failure(generation, url, mainFrame, 403, "Blocked");
        }
      }

      try {
        InputStream asset = context.getAssets().open(ASSET_DIRECTORY + "/" + relativePath);
        if (mimeType(relativePath).equals("text/html")) {
          try (InputStream input = asset; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
            asset = new ByteArrayInputStream(bridgeDocument(output.toString(StandardCharsets.UTF_8.name())).getBytes(StandardCharsets.UTF_8));
          }
        }
        return new WebResourceResponse(
          mimeType(relativePath),
          "UTF-8",
          asset
        );
      } catch (IOException error) {
        return failure(generation, url, mainFrame, 404, "Not Found");
      }
    }

    private WebResourceResponse failure(int generation, Uri url, boolean mainFrame, int status, String reason) {
      state.error(generation, url.toString(), "asset_missing", reason, mainFrame);
      return errorResponse(status, reason);
    }

    private static WebResourceResponse errorResponse(int status, String reason) {
      return new WebResourceResponse(
        "text/plain",
        "UTF-8",
        status,
        reason,
        Collections.emptyMap(),
        new ByteArrayInputStream(reason.getBytes(StandardCharsets.UTF_8))
      );
    }

    private static String mimeType(String path) {
      String extension = path.contains(".")
        ? path.substring(path.lastIndexOf('.') + 1).toLowerCase()
        : "";
      return switch (extension) {
        case "css" -> "text/css";
        case "html" -> "text/html";
        case "js", "mjs" -> "text/javascript";
        case "json" -> "application/json";
        case "png" -> "image/png";
        case "svg" -> "image/svg+xml";
        case "wasm" -> "application/wasm";
        case "woff" -> "font/woff";
        case "woff2" -> "font/woff2";
        default -> "application/octet-stream";
      };
    }
  }
}
