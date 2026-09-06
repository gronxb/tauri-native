package com.reactnativetauri

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
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
    webViewClient = AssetWebViewClient(context)
  }

  private fun loadPackagedFrontend(context: Context) {
    val html = try {
      context.assets.open("$ASSET_DIRECTORY/index.html")
        .bufferedReader()
        .use { it.readText() }
    } catch (_: IOException) {
      """
        <h2>tauri-native assets are missing</h2>
        <p>Run tauri-native export android before Expo prebuild.</p>
      """.trimIndent()
    }


    loadDataWithBaseURL(
      ASSET_ORIGIN,
      bridgeDocument(html),
      "text/html",
      "UTF-8",
      null,
    )
  }

  override fun onDetachedFromWindow() {
    bridge.suspend()
    evaluateJavascript("window.__RNTauriSuspend?.();", null)
    super.onDetachedFromWindow()
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    bridge.resume()
    loadPackagedFrontend(context)
  }

  override fun destroy() {
    bridge.destroy()
    removeJavascriptInterface(BRIDGE_NAME)
    super.destroy()
  }

  private class AssetWebViewClient(
    private val context: Context,
  ) : WebViewClient() {
    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean = !isAssetUrl(request.url)

    @Deprecated("Deprecated in Java")
    override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
      !isAssetUrl(Uri.parse(url))

    override fun shouldInterceptRequest(
      view: WebView,
      request: WebResourceRequest,
    ): WebResourceResponse = assetResponse(request.url)

    @Deprecated("Deprecated in Java")
    override fun shouldInterceptRequest(
      view: WebView,
      url: String,
    ): WebResourceResponse = assetResponse(Uri.parse(url))

    private fun assetResponse(url: Uri): WebResourceResponse {
      if (!isAssetUrl(url)) {
        return errorResponse(403, "Blocked")
      }

      val relativePath = url.path.orEmpty()
        .removePrefix("/")
        .ifEmpty { "index.html" }
      if (relativePath.split('/').any { it == "." || it == ".." }) {
        return errorResponse(403, "Blocked")
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
        errorResponse(404, "Not Found")
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
    private const val ASSET_ORIGIN = "https://tauri-native.local/"
    private const val BRIDGE_SOURCE = """
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
      window.__TAURI_NATIVE_HOST__ = "react-native";
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
