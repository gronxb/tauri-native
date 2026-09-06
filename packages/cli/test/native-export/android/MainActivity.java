package dev.taurinative.artifacttest;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  static { System.loadLibrary("artifact_host"); }
  private static native byte[] invokeNative(byte[] command, byte[] payload);
  private static native int[] nativeCounts();
  private final Handler handler = new Handler();
  private final JSONArray direct = new JSONArray();
  private WebView view;
  private boolean finished;

  private String call(String command, String payload) {
    return new String(invokeNative(command.getBytes(StandardCharsets.UTF_8), payload.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
  }

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    try {
      direct.put(new JSONObject(call("describe", "{\"request\":{\"displayName\":\"한글 🦀\",\"values\":[2,3,5]}}")));
      direct.put(new JSONObject(call("describe", "{\"request\":{\"displayName\":\"\",\"values\":[]}}")));
      direct.put(new JSONObject(call("optional", "{}")));
      view = new WebView(this); view.getSettings().setJavaScriptEnabled(true);
      view.addJavascriptInterface(new Bridge(), "ArtifactHost");
      view.setWebViewClient(new WebViewClient() {
        @Override public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest request) {
          try {
            if (!"https".equals(request.getUrl().getScheme()) || !"artifact.local".equals(request.getUrl().getHost())) throw new IllegalArgumentException("External request");
            String file = request.getUrl().getPath().substring(1);
            if (file.isEmpty()) file = "index.html";
            for (String component : file.split("/")) if (component.equals(".") || component.equals("..")) throw new IllegalArgumentException("Traversal");
            byte[] bytes;
            try (InputStream input = getAssets().open("tauri-native/" + file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
              byte[] buffer = new byte[4096]; int length;
              while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
              bytes = output.toByteArray();
            }
            String mime = file.endsWith(".html") ? "text/html" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
            if (file.equals("index.html")) {
              // Host-owned bootstrap; the copied frontend files remain unchanged.
              String shim = "<script>(()=>{let next=1;const pending=new Map();"
                + "window.__artifactResolve=(id,r)=>{const p=pending.get(id);if(!p)return;pending.delete(id);r.ok?p.resolve(r.value):p.reject(r.error)};"
                + "window.__TAURI_INTERNALS__={invoke(command,payload={}){return new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});ArtifactHost.postMessage(JSON.stringify({id,command,payload}))})}};})()</script>";
              bytes = new String(bytes, StandardCharsets.UTF_8).replace("<head>", "<head>" + shim).getBytes(StandardCharsets.UTF_8);
            }
            return new WebResourceResponse(mime, "UTF-8", new ByteArrayInputStream(bytes));
          } catch (Exception error) {
            return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
          }
        }
        @Override public void onPageFinished(WebView webView, String url) { poll(); }
      });
      setContentView(view); view.loadUrl("https://artifact.local/index.html");
      handler.postDelayed(() -> fail(new RuntimeException("Frontend timed out")), 40000);
    } catch (Exception error) { fail(error); }
  }

  private final class Bridge {
    @JavascriptInterface public void postMessage(String text) {
      try {
        JSONObject request = new JSONObject(text);
        String response = call(request.getString("command"), request.getJSONObject("payload").toString());
        int id = request.getInt("id");
        runOnUiThread(() -> view.evaluateJavascript("window.__artifactResolve(" + id + "," + response + ")", null));
      } catch (Exception error) { runOnUiThread(() -> fail(error)); }
    }
  }

  private void poll() {
    if (finished) return;
    view.evaluateJavascript("document.querySelector('#result').textContent", value -> {
      try {
        String text = new JSONArray("[" + value + "]").optString(0);
        if (!text.startsWith("{")) { handler.postDelayed(this::poll, 100); return; }
        int[] counts = nativeCounts();
        JSONObject result = new JSONObject().put("abiVersion", 2).put("direct", direct).put("frontend", new JSONObject(text)).put("responses", counts[0]).put("frees", counts[1]);
        finishReport(result);
      } catch (Exception error) { fail(error); }
    });
  }

  private void fail(Exception error) {
    if (finished) return;
    try { finishReport(new JSONObject().put("fatal", error.toString())); }
    catch (Exception failure) { throw new RuntimeException(failure); }
  }

  private void finishReport(JSONObject result) throws Exception {
    if (finished) return;
    finished = true;
    File temporary = new File(getFilesDir(), "report.tmp");
    try (FileOutputStream output = new FileOutputStream(temporary)) { output.write(result.toString().getBytes(StandardCharsets.UTF_8)); }
    if (!temporary.renameTo(new File(getFilesDir(), "report.json"))) throw new RuntimeException("Cannot publish test result");
  }
}
