package dev.taurinative.lynx;

import android.net.Uri;
import android.webkit.WebView;
import java.io.InputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

// Shared Android lifecycle/URL/message state; framework event dispatch stays in the view element.
final class TauriViewState {
  interface Listener { void onState(Map<String, String> state); }
  Listener listener;
  private final WebView view;
  private final TauriJavascriptBridge bridge;
  private String path = "/index.html";
  private String lastMessage;
  private boolean ready;
  private volatile int generation;

  TauriViewState(WebView view, TauriJavascriptBridge bridge) {
    this.view = view; this.bridge = bridge;
    bridge.setListener((type, event, payload) -> {
      if (type.equals("ready")) {
        if (!ready) { ready = true; emit("ready", view.getUrl(), "", "", "", "null"); }
      }
      else emit("event", view.getUrl(), "", "", event, payload);
    });
  }

  void setPath(String value) {
    String next = value == null || value.isEmpty() ? "/index.html" : value;
    if (next.equals(path)) return;
    path = next;
    if (view.isAttachedToWindow()) load();
  }

  void load() {
    Uri url = Uri.parse("https://tauri-native.local" + path);
    if (!path.startsWith("/") || path.startsWith("//") || path.contains("\\") || path.chars().anyMatch(c -> c < 32 || c == 127)
        || !"https".equals(url.getScheme()) || !"tauri-native.local".equals(url.getHost())
        || url.getPathSegments().stream().anyMatch(p -> p.equals(".") || p.equals(".."))) {
      emit("error", path, "invalid_path", "Use a local packaged path starting with /", "", "null");
      return;
    }
    reset();
    view.evaluateJavascript("window.__RNTauriSuspend?.();", null);
    view.stopLoading();
    String relative = url.getPath().substring(1);
    if (relative.isEmpty()) relative = "index.html";
    try (InputStream input = view.getContext().getAssets().open("tauri-native/" + relative)) {
      // The existing request interceptor serves and injects this packaged HTML.
      view.loadUrl(url.toString());
    } catch (IOException error) {
      emit("error", url.toString(), "asset_missing", "Packaged document could not be loaded", "", "null");
    }
  }

  private void reset() {
    generation++; ready = false;
    bridge.suspend(); bridge.resume();
  }
  void started(String url) {
    // The new document's open frame can reach the bridge before this UI callback.
    // Open/pagehide own Rust sessions; resetting here would discard the new one.
    generation++; ready = false;
    emit("loadstart", url, "", "", "", "null");
  }
  void detached() {
    generation++; ready = false;
    bridge.suspend(); view.evaluateJavascript("window.__RNTauriSuspend?.();", null);
  }
  int generation() { return generation; }
  void error(int expected, String url, String code, String message, boolean mainFrame) {
    view.post(() -> {
      if (expected != generation) return;
      if (mainFrame) ready = false;
      emit("error", url, code, message, "", "null");
    });
  }

  void sendMessage(String json) {
    if (json == null || json.isEmpty()) return;
    try {
      JSONObject message = new JSONObject(json);
      String id = message.getString("id"); String event = message.getString("event");
      if (id.isEmpty()) throw new IllegalArgumentException("A message needs an id");
      if (id.equals(lastMessage)) return;
      lastMessage = id;
      String document = bridge.currentDocument();
      if (!ready || document == null) {
        emit("error", view.getUrl(), "not_ready", "Send messages after the view is ready", "", "null");
        return;
      }
      JSONArray arguments = new JSONArray().put(document).put(event).put(message.opt("payload"));
      int expected = generation;
      view.evaluateJavascript("window.__RNTauriHostEvent?.apply(null, " + arguments + ");", value -> {
        if (expected != generation || !document.equals(bridge.currentDocument())) return;
        if (!"\"\"".equals(value)) emit("error", view.getUrl(), "event_delivery_failed", value == null ? "Bridge unavailable" : value, "", "null");
      });
    } catch (Exception error) {
      emit("error", view.getUrl(), "invalid_message", "A message needs an id, event name and JSON payload", "", "null");
    }
  }

  private void emit(String type, String url, String code, String message, String event, String payload) {
    if (listener == null || !view.isAttachedToWindow()) return;
    Map<String, String> state = new HashMap<>();
    state.put("type", type); state.put("url", url == null ? "" : url); state.put("code", code);
    state.put("message", message); state.put("event", event); state.put("payload", payload);
    listener.onState(state);
  }
}
