package dev.taurinative.lynx;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
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
  private static final String ASSET_ORIGIN = "https://tauri-native.local/";
  private static final String BRIDGE_SOURCE = """
    (() => {
      let documentId;
      let nextId = 1;
      let active = false;
      let timer;
      let polling = false;
      const pending = new Map();
      const post = (message) => window.TauriNativeBridge.postMessage(JSON.stringify(message));
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
      window.__TAURI_NATIVE_HOST__ = "lynx";
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
    """;

  private final TauriJavascriptBridge bridge;

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
    addJavascriptInterface(bridge, BRIDGE_NAME);
    setWebViewClient(new AssetWebViewClient(context.getApplicationContext()));
  }

  private void loadPackagedFrontend(Context context) {
    String html;
    try (
      InputStream input = context.getAssets().open(ASSET_DIRECTORY + "/index.html");
      ByteArrayOutputStream output = new ByteArrayOutputStream()
    ) {
      byte[] buffer = new byte[8192];
      int length;
      while ((length = input.read(buffer)) != -1) {
        output.write(buffer, 0, length);
      }
      html = output.toString(StandardCharsets.UTF_8.name());
    } catch (IOException error) {
      html = "<h2>tauri-native assets are missing</h2>" +
        "<p>Run tauri-native export android before building the Lynx app.</p>";
    }


    loadDataWithBaseURL(ASSET_ORIGIN, bridgeDocument(html), "text/html", "UTF-8", null);
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
    bridge.suspend();
    evaluateJavascript("window.__RNTauriSuspend?.();", null);
    super.onDetachedFromWindow();
  }

  @Override
  protected void onAttachedToWindow() {
    super.onAttachedToWindow();
    bridge.resume();
    loadPackagedFrontend(getContext());
  }

  @Override
  public void destroy() {
    bridge.destroy();
    removeJavascriptInterface(BRIDGE_NAME);
    super.destroy();
  }

  private static final class AssetWebViewClient extends WebViewClient {
    private final Context context;

    AssetWebViewClient(Context context) {
      this.context = context;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      return !isAssetUrl(request.getUrl());
    }

    @Override
    @SuppressWarnings("deprecation")
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
      return !isAssetUrl(Uri.parse(url));
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(
      WebView view,
      WebResourceRequest request
    ) {
      return assetResponse(request.getUrl());
    }

    @Override
    @SuppressWarnings("deprecation")
    public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
      return assetResponse(Uri.parse(url));
    }

    private WebResourceResponse assetResponse(Uri url) {
      if (!isAssetUrl(url)) {
        return errorResponse(403, "Blocked");
      }

      String relativePath = url.getPath() == null ? "" : url.getPath();
      relativePath = relativePath.startsWith("/") ? relativePath.substring(1) : relativePath;
      relativePath = relativePath.isEmpty() ? "index.html" : relativePath;
      for (String segment : relativePath.split("/")) {
        if (segment.equals(".") || segment.equals("..")) {
          return errorResponse(403, "Blocked");
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
        return errorResponse(404, "Not Found");
      }
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
