package dev.taurinative.lynx.retained;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxModule;
import com.lynx.react.bridge.Callback;
import dev.taurinative.runtime.RuntimeSession;
import java.util.HashMap;
import java.util.UUID;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

/** A Lynx background module that marshals into the original Tauri app on main. */
public final class TauriRuntimeModule extends LynxModule {
  private final Scope scope;

  public TauriRuntimeModule(Context context, Object parameter) {
    super(context, parameter);
    if (!(parameter instanceof Scope)) throw new IllegalArgumentException("Use TauriLynxHost to own runtime sessions");
    scope = (Scope) parameter;
  }

  @LynxMethod public void exchange(String operation, Callback callback) {
    scope.main.post(() -> {
      if (scope.closed) return;
      try { scope.exchange(new JSONObject(operation), reply -> { if (!scope.closed) callback.invoke(reply.toString()); }); }
      catch (JSONException error) { callback.invoke(failure("invalid_request", error.getMessage()).toString()); }
      catch (IllegalStateException error) {
        // The platform client's open failure preserves the original ABI response.
        JSONObject reply;
        try { reply = new JSONObject(error.getMessage()); }
        catch (JSONException invalid) { reply = failure("runtime_error", error.getMessage()); }
        callback.invoke(reply.toString());
      }
    });
  }

  @Override public void destroy() { scope.main.post(scope::close); super.destroy(); }

  private static JSONObject object(Object... pairs) {
    try {
      JSONObject result = new JSONObject();
      for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
      return result;
    } catch (JSONException error) { throw new IllegalArgumentException(error); }
  }

  private static JSONObject failure(String code, String message) { return object("ok", false, "code", code, "error", message); }

  /** Owned by one surface, never shared across renderer replacements. Main thread only. */
  public static final class Scope implements AutoCloseable {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final HashMap<String, OwnedSession> sessions = new HashMap<>();
    private boolean closed;

    private void exchange(JSONObject operation, Consumer<JSONObject> callback) throws JSONException {
      String op = operation.getString("op");
      if (op.equals("status")) { callback.accept(RuntimeSession.status()); return; }
      if (op.equals("open")) {
        OwnedSession session = new OwnedSession(operation.getString("caller"));
        String id = UUID.randomUUID().toString();
        sessions.put(id, session);
        callback.accept(object("ok", true, "session", id));
        return;
      }
      String key = operation.getString("session");
      OwnedSession session = sessions.get(key);
      if (op.equals("close")) {
        if (session != null) { sessions.remove(key); session.runtime.close(); }
        callback.accept(object("ok", true)); return;
      }
      if (session == null) { callback.accept(failure("session_closed", "Native session is closed")); return; }
      switch (op) {
        case "invoke": case "listen": {
          String id = operation.getString("id");
          if (session.pending.containsKey(id)) { callback.accept(failure("duplicate_request", "Request ID is already pending")); return; }
          Consumer<JSONObject> complete = reply -> { session.pending.remove(id); callback.accept(reply); };
          long request = op.equals("invoke")
            ? session.runtime.invoke(operation.getString("command"), operation.getJSONObject("payload"), complete)
            : session.runtime.listen(operation.getString("event"), complete);
          if (request != 0) session.pending.put(id, request);
          return;
        }
        case "events": session.runtime.pollEvents(callback); return;
        case "unlisten": callback.accept(object("ok", true, "removed", session.runtime.unlisten(operation.getLong("subscription")))); return;
        case "cancel": {
          Long request = session.pending.remove(operation.getString("id"));
          if (request != null) session.runtime.cancel(request);
          callback.accept(object("ok", true)); return;
        }
        default: callback.accept(failure("invalid_request", "Unknown operation: " + op));
      }
    }

    @Override public void close() {
      if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Close the Lynx scope on main");
      if (closed) return;
      closed = true;
      main.removeCallbacksAndMessages(null);
      for (OwnedSession session : sessions.values()) session.runtime.close();
      sessions.clear();
    }
  }

  private static final class OwnedSession {
    final RuntimeSession runtime;
    final HashMap<String, Long> pending = new HashMap<>();
    OwnedSession(String caller) { runtime = new RuntimeSession(caller); }
  }
}
