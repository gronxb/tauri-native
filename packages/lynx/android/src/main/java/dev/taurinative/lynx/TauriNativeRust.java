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
}
