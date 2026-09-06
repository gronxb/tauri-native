package __TAURI_NATIVE_JAVA_PACKAGE__;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.content.Context;
import java.io.File;
import org.json.JSONArray;
import org.json.JSONObject;

final class TauriJavascriptBridge {
  static String appDataDir(Context context) {
    return new File(context.getFilesDir(), "tauri-native").getAbsolutePath() + "/";
  }
  interface Listener { void onMessage(String type, String event, String payload); }
  private final WebView webView;
  private Listener listener;
  private String document;
  private long session;
  private boolean suspended;
  private boolean destroyed;

  TauriJavascriptBridge(WebView webView) { this.webView = webView; }
  void setListener(Listener listener) { this.listener = listener; }
  synchronized String currentDocument() { return suspended || destroyed ? null : document; }

  private void notifyHost(String targetDocument, String type, String event, String payload) {
    webView.post(() -> {
      synchronized (this) {
        if (suspended || destroyed || !targetDocument.equals(document)) return;
      }
      if (listener != null) listener.onMessage(type, event, payload);
    });
  }

  private void closeSession() {
    if (session != 0) __TAURI_NATIVE_JAVA_RUST__.closeSession(session);
    session = 0;
  }

  synchronized void suspend() {
    suspended = true;
    document = null;
    closeSession();
  }

  synchronized void resume() { if (!destroyed) suspended = false; }

  synchronized void destroy() {
    destroyed = true;
    suspend();
    listener = null;
  }

  private void deliver(String targetDocument, String function, Object... arguments) {
    JSONArray values = new JSONArray();
    values.put(targetDocument);
    for (Object argument : arguments) values.put(argument);
    String script = "window." + function + "?.apply(null, " + values + ");";
    webView.post(() -> {
      synchronized (this) {
        if (suspended || !targetDocument.equals(document)) return;
      }
      webView.evaluateJavascript(script, null);
    });
  }

  // WebView calls this on its bridge thread. ABI 2 only queues/drains Rust work.
  @JavascriptInterface
  public synchronized void postMessage(String requestJson) {
    if (suspended || destroyed) return;
    String requestDocument = null;
    String id = null;
    String type = null;
    try {
      JSONObject request = new JSONObject(requestJson);
      requestDocument = request.getString("document");
      type = request.getString("type");
      if (type.equals("open")) {
        closeSession();
        document = requestDocument;
        return;
      }
      if (!requestDocument.equals(document)) return;
      switch (type) {
        case "ready": notifyHost(document, "ready", "", "null"); return;
        case "event":
          Object eventPayload = request.opt("payload");
          String eventJSON = eventPayload instanceof String ? JSONObject.quote((String)eventPayload) : eventPayload == null ? "null" : eventPayload.toString();
          notifyHost(document, "event", request.getString("event"), eventJSON);
          return;
        case "close": closeSession(); return;
        case "poll":
          deliver(document, "__RNTauriDrain", session == 0 ? "[]" : __TAURI_NATIVE_JAVA_RUST__.poll(session));
          return;
        case "invoke":
          id = request.getString("id");
          String command = request.getString("command");
          String payload = request.opt("payload") == null ? "{}" : request.get("payload").toString();
          if (command.startsWith("plugin:path|")) {
            JSONObject arguments = request.optJSONObject("payload");
            Object directory = arguments == null ? null : arguments.opt("directory");
            if (!command.equals("plugin:path|resolve_directory") || arguments == null || arguments.length() != 1 || !(directory instanceof Number) || ((Number)directory).doubleValue() != 14) {
              deliver(document, "__RNTauriResolve", id, "", "unsupported_path_operation");
            } else deliver(document, "__RNTauriResolve", id, JSONObject.quote(appDataDir(webView.getContext())));
            return;
          }
          if (session == 0) session = __TAURI_NATIVE_JAVA_RUST__.createSession();
          if (session == 0) {
            // ABI 0/1 retain the legacy bridge-thread execution path.
            deliver(document, "__RNTauriResolve", id, __TAURI_NATIVE_JAVA_RUST__.invoke(command, payload));
          } else {
            String acknowledgement = __TAURI_NATIVE_JAVA_RUST__.start(session, id, command, payload);
            if (!acknowledgement.isEmpty()) deliver(document, "__RNTauriResolve", id, "", new JSONObject(acknowledgement).optString("error", "invalid_response"));
          }
          return;
        default: return;
      }
    } catch (Exception error) {
      String message = error.getMessage() == null ? "Native invoke failed" : error.getMessage();
      if (id != null) deliver(requestDocument, "__RNTauriResolve", id, "", message);
      else if ("poll".equals(type)) deliver(requestDocument, "__RNTauriDrain", "{\"error\":\"invalid_response\"}");
    }
  }
}
