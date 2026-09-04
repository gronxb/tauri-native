package dev.taurinative.lynx;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.webkit.JavascriptInterface;
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
import org.json.JSONObject;

@SuppressLint("SetJavaScriptEnabled")
public final class TauriWebView extends WebView {
  private static final String BRIDGE_NAME = "TauriNativeBridge";
  private static final String ASSET_DIRECTORY = "tauri-native";
  private static final String ASSET_ORIGIN = "https://tauri-native.local/";
  private static final String BRIDGE_SOURCE = """
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
      window.__TAURI_NATIVE_HOST__ = 'lynx';
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
    """;

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

    addJavascriptInterface(new TauriJavascriptBridge(this), BRIDGE_NAME);
    setWebViewClient(new AssetWebViewClient(context.getApplicationContext()));
    loadPackagedFrontend(context);
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

    String bridgeScript = "<script>" + BRIDGE_SOURCE + "</script>";
    int headStart = html.toLowerCase().indexOf("<head");
    int headEnd = headStart >= 0 ? html.indexOf('>', headStart) : -1;
    String document = headEnd >= 0
      ? html.substring(0, headEnd + 1) + bridgeScript + html.substring(headEnd + 1)
      : bridgeScript + html;

    loadDataWithBaseURL(ASSET_ORIGIN, document, "text/html", "UTF-8", null);
  }

  private static boolean isAssetUrl(Uri url) {
    return "https".equals(url.getScheme()) && "tauri-native.local".equals(url.getHost());
  }

  private static final class TauriJavascriptBridge {
    private final WebView webView;

    TauriJavascriptBridge(WebView webView) {
      this.webView = webView;
    }

    @JavascriptInterface
    public void invoke(String requestJson) {
      Long requestId = null;
      try {
        JSONObject request = new JSONObject(requestJson);
        requestId = request.getLong("id");
        String command = request.getString("command");
        Object payload = request.opt("payload");
        String response = TauriNativeRust.invoke(
          command,
          payload == null ? "{}" : payload.toString()
        );
        String quotedResponse = JSONObject.quote(response);
        long completedRequestId = requestId;
        webView.post(() -> webView.evaluateJavascript(
          "window.__RNTauriResolve(" + completedRequestId + ", " + quotedResponse + ");",
          null
        ));
      } catch (Exception error) {
        if (requestId == null) {
          return;
        }
        String message = JSONObject.quote(
          error.getMessage() == null ? "Native invoke failed" : error.getMessage()
        );
        long failedRequestId = requestId;
        webView.post(() -> webView.evaluateJavascript(
          "window.__RNTauriReject(" + failedRequestId + ", " + message + ");",
          null
        ));
      }
    }
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
        return new WebResourceResponse(
          mimeType(relativePath),
          "UTF-8",
          context.getAssets().open(ASSET_DIRECTORY + "/" + relativePath)
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
