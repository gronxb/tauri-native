package dev.taurinative.lynx;

import java.nio.charset.StandardCharsets;

final class TauriNativeRust {
  static {
    System.loadLibrary("taurinativelynx");
  }

  private TauriNativeRust() {}

  static String invoke(String command, String payloadJson) {
    byte[] response = invokeBytes(
      command.getBytes(StandardCharsets.UTF_8),
      payloadJson.getBytes(StandardCharsets.UTF_8)
    );
    return new String(response, StandardCharsets.UTF_8);
  }

  private static native byte[] invokeBytes(byte[] command, byte[] payloadJson);
  static native long createSession();
  static String start(long session, String id, String command, String payload) {
    return new String(startBytes(session, id.getBytes(StandardCharsets.UTF_8), command.getBytes(StandardCharsets.UTF_8), payload.getBytes(StandardCharsets.UTF_8)), StandardCharsets.UTF_8);
  }
  static String poll(long session) { return new String(pollBytes(session), StandardCharsets.UTF_8); }
  static void cancel(long session, String id) { cancelBytes(session, id.getBytes(StandardCharsets.UTF_8)); }
  static native void closeSession(long session);
  private static native byte[] startBytes(long session, byte[] id, byte[] command, byte[] payload);
  private static native byte[] pollBytes(long session);
  private static native void cancelBytes(long session, byte[] id);
}
