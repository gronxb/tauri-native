package dev.taurinative.lynx;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;

final class TauriJavascriptBridge {
  private final WebView webView;
  private String document;
  private long session;
  private boolean suspended;
  private boolean destroyed;

  TauriJavascriptBridge(WebView webView) { this.webView = webView; }

  private void closeSession() {
    if (session != 0) TauriNativeRust.closeSession(session);
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
        case "close": closeSession(); return;
        case "poll":
          deliver(document, "__RNTauriDrain", session == 0 ? "[]" : TauriNativeRust.poll(session));
          return;
        case "invoke":
          id = request.getString("id");
          String command = request.getString("command");
          String payload = request.opt("payload") == null ? "{}" : request.get("payload").toString();
          if (session == 0) session = TauriNativeRust.createSession();
          if (session == 0) {
            // ABI 0/1 retain the legacy bridge-thread execution path.
            deliver(document, "__RNTauriResolve", id, TauriNativeRust.invoke(command, payload));
          } else {
            String acknowledgement = TauriNativeRust.start(session, id, command, payload);
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
