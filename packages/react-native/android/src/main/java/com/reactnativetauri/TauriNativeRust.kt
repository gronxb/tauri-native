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

  external fun createSession(): Long
  fun start(session: Long, id: String, command: String, payload: String): String = String(
    startBytes(session, id.toByteArray(Charsets.UTF_8), command.toByteArray(Charsets.UTF_8), payload.toByteArray(Charsets.UTF_8)), Charsets.UTF_8,
  )
  fun poll(session: Long): String = String(pollBytes(session), Charsets.UTF_8)
  fun cancel(session: Long, id: String) = cancelBytes(session, id.toByteArray(Charsets.UTF_8))
  external fun closeSession(session: Long)
  private external fun startBytes(session: Long, id: ByteArray, command: ByteArray, payload: ByteArray): ByteArray
  private external fun pollBytes(session: Long): ByteArray
  private external fun cancelBytes(session: Long, id: ByteArray)
}
