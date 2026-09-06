package dev.taurinative.lynx;

import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxNativeModule;
import com.lynx.tasm.behavior.LynxContext;
import dev.taurinative.lynx.generated.TauriNativeSpec;
import java.util.HashMap;
import java.util.Map;

@LynxNativeModule(name = "TauriNative")
public final class TauriNative extends TauriNativeSpec {
  private final String dataDirectory;
  private final Map<String, Long> sessions = new HashMap<>();
  private boolean closed;
  public TauriNative(LynxContext context) {
    super(context);
    dataDirectory = TauriJavascriptBridge.appDataDir(context);
  }

  @Override @LynxMethod
  public String appDataDir() { return dataDirectory; }

  @Override
  @LynxMethod
  public String invoke(String command, String payloadJson) {
    return TauriNativeRust.invoke(command, payloadJson);
  }

  @Override @LynxMethod
  public synchronized String createSession() {
    if (closed) return "";
    long session = TauriNativeRust.createSession();
    if (session == 0) return "";
    String id = Long.toString(session);
    sessions.put(id, session);
    return id;
  }

  @Override @LynxMethod
  public synchronized String start(String session, String id, String command, String payload) {
    Long handle = sessions.get(session);
    return handle == null ? "{\"error\":\"closed_session\"}" : TauriNativeRust.start(handle, id, command, payload);
  }

  @Override @LynxMethod
  public synchronized String poll(String session) {
    Long handle = sessions.get(session);
    return handle == null ? "{\"error\":\"closed_session\"}" : TauriNativeRust.poll(handle);
  }

  @Override @LynxMethod
  public synchronized void cancel(String session, String id) {
    Long handle = sessions.get(session);
    if (handle != null) TauriNativeRust.cancel(handle, id);
  }

  @Override @LynxMethod
  public synchronized void closeSession(String session) {
    Long handle = sessions.remove(session);
    if (handle != null) TauriNativeRust.closeSession(handle);
  }

  @Override
  public synchronized void destroy() {
    closed = true;
    for (long session : sessions.values()) TauriNativeRust.closeSession(session);
    sessions.clear();
    super.destroy();
  }
}
