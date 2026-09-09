package dev.taurinative.runtime;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.function.Consumer;

/** A renderer-owned session in the existing Tauri application. Use on the main thread. */
public final class RuntimeSession implements AutoCloseable {
  private static native String request(String request);
  private final Handler main = new Handler(Looper.getMainLooper());
  private final HashMap<Long, Consumer<JSONObject>> pending = new HashMap<>();
  private final long session;
  private boolean closed;

  private static JSONObject object(Object... pairs) {
    try {
      JSONObject result = new JSONObject();
      for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
      return result;
    } catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
  }

  private static JSONObject exchange(JSONObject operation) {
    try {
      JSONObject envelope = new JSONObject(request(operation.toString()));
      if (envelope.getInt("abiVersion") != 3) throw new IllegalStateException("Retained Tauri runtime requires ABI 3");
      return envelope.getJSONObject("response");
    } catch (org.json.JSONException error) { throw new IllegalStateException("Invalid retained Tauri response", error); }
  }

  private static void assertMain() {
    if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Use RuntimeSession on the main thread");
  }

  public static JSONObject status() { return exchange(object("op", "status")); }

  public RuntimeSession(String caller) {
    assertMain();
    JSONObject opened = exchange(object("op", "open", "caller", caller));
    if (!opened.optBoolean("ok")) throw new IllegalStateException(opened.toString());
    session = opened.optLong("session");
  }

  public long invoke(String command, JSONObject payload, Consumer<JSONObject> callback) {
    return start(object("op", "submit", "session", session, "command", command, "payload", payload), callback);
  }

  /** Completion contains the subscription ID; cancel the request to abandon registration. */
  public long listen(String event, Consumer<JSONObject> callback) {
    return start(object("op", "listen", "session", session, "event", event), callback);
  }

  /** Each batch rechecks the original live WebView origin and Tauri capability. */
  public long pollEvents(Consumer<JSONObject> callback) {
    return start(object("op", "events", "session", session), callback);
  }

  public boolean unlisten(long subscription) {
    assertMain();
    return !closed && exchange(object("op", "unlisten", "session", session, "subscription", subscription)).optBoolean("removed");
  }

  private long start(JSONObject operation, Consumer<JSONObject> callback) {
    assertMain();
    if (closed) { callback.accept(object("ok", false, "code", "session_closed", "error", "Native session is closed")); return 0; }
    JSONObject submitted = exchange(operation);
    if (!submitted.optBoolean("ok")) { callback.accept(submitted); return 0; }
    long id = submitted.optLong("request");
    pending.put(id, callback);
    main.post(() -> poll(id));
    return id;
  }

  private void poll(long id) {
    if (!pending.containsKey(id)) return;
    JSONObject response = exchange(object("op", "poll", "session", session, "request", id));
    if (response.optBoolean("ok") && response.optString("status").equals("pending")) {
      main.postDelayed(() -> poll(id), 16);
      return;
    }
    Consumer<JSONObject> callback = pending.remove(id);
    callback.accept(response.optBoolean("ok") ? response.optJSONObject("result") : response);
  }

  public void cancel(long id) {
    assertMain();
    Consumer<JSONObject> callback = pending.remove(id);
    if (callback == null) return;
    exchange(object("op", "cancel", "session", session, "request", id));
    callback.accept(object("ok", false, "code", "request_cancelled", "error", "Native request cancelled"));
  }

  @Override public void close() {
    assertMain();
    if (closed) return;
    closed = true;
    main.removeCallbacksAndMessages(null);
    exchange(object("op", "close", "session", session));
    ArrayList<Consumer<JSONObject>> callbacks = new ArrayList<>(pending.values());
    pending.clear();
    for (Consumer<JSONObject> callback : callbacks) callback.accept(object("ok", false, "code", "session_closed", "error", "Native session is closed"));
  }
}
