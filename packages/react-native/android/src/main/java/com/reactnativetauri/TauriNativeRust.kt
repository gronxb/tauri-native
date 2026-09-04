package com.reactnativetauri

internal object TauriNativeRust {
  init {
    System.loadLibrary("reactnativetauri")
  }

  fun invoke(command: String, payloadJson: String): String = String(
    invokeBytes(
      command.toByteArray(Charsets.UTF_8),
      payloadJson.toByteArray(Charsets.UTF_8),
    ),
    Charsets.UTF_8,
  )

  private external fun invokeBytes(
    command: ByteArray,
    payloadJson: ByteArray,
  ): ByteArray
}
