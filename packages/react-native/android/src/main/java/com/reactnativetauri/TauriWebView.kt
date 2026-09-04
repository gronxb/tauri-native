package com.reactnativetauri

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.IOException
import org.json.JSONObject

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
    loadPackagedFrontend(context)
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

    val bridgeScript = "<script>$BRIDGE_SOURCE</script>"
    val headStart = html.indexOf("<head", ignoreCase = true)
    val headEnd = if (headStart >= 0) html.indexOf('>', headStart) else -1
    val document = if (headEnd >= 0) {
      html.substring(0, headEnd + 1) + bridgeScript + html.substring(headEnd + 1)
    } else {
      bridgeScript + html
    }

    loadDataWithBaseURL(
      ASSET_ORIGIN,
      document,
      "text/html",
      "UTF-8",
      null,
    )
  }

  internal class TauriJavascriptBridge(
    private val webView: WebView,
  ) {
    @JavascriptInterface
    fun invoke(requestJson: String) {
      var requestId: Long? = null
      try {
        val request = JSONObject(requestJson)
        requestId = request.getLong("id")
        val command = request.getString("command")
        val payload = request.opt("payload") ?: JSONObject()
        val response = TauriNativeRust.invoke(command, payload.toString())
        val quotedResponse = JSONObject.quote(response)
        webView.post {
          webView.evaluateJavascript(
            "window.__RNTauriResolve($requestId, $quotedResponse);",
            null,
          )
        }
      } catch (error: Exception) {
        val failedRequestId = requestId ?: return
        val message = JSONObject.quote(error.message ?: "Native invoke failed")
        webView.post {
          webView.evaluateJavascript(
            "window.__RNTauriReject($failedRequestId, $message);",
            null,
          )
        }
      }
    }
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
          context.assets.open("$ASSET_DIRECTORY/$relativePath"),
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
        let nextId = 1;
        const pending = new Map();
        window.__RNTauriResolve = (id, responseJson) => {
          const callbacks = pending.get(id);
          if (!callbacks) return;
          pending.delete(id);
          callbacks.resolve(JSON.parse(responseJson));
        };
        window.__RNTauriReject = (id, message) => {
          const callbacks = pending.get(id);
          if (!callbacks) return;
          pending.delete(id);
          callbacks.reject(new Error(message));
        };
        window.__TAURI_NATIVE_HOST__ = 'react-native';
        globalThis.isTauri = true;
        const internals = window.__TAURI_INTERNALS__ || {};
        internals.invoke = (command, payload) => {
          return new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            window.TauriNativeBridge.invoke(JSON.stringify({
              id,
              command,
              payload: payload ?? {}
            }));
          });
        };
        window.__TAURI_INTERNALS__ = internals;
      })();
    """

    private fun isAssetUrl(url: Uri): Boolean =
      url.scheme == "https" && url.host == "tauri-native.local"
  }
}
