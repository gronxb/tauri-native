package com.reactnativetauri

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeTauriSpec.NAME)
internal class TauriNativeModule(
  reactContext: ReactApplicationContext,
) : NativeTauriSpec(reactContext) {
  private val dataDirectory = TauriJavascriptBridge.appDataDir(reactContext)
  private val sessions = mutableMapOf<String, Long>()
  private var closed = false

  override fun appDataDir(): String = dataDirectory

  override fun invoke(command: String, payloadJson: String): String =
    TauriNativeRust.invoke(command, payloadJson)

  @Synchronized
  override fun createSession(): String {
    if (closed) return ""
    val session = TauriNativeRust.createSession()
    if (session == 0L) return ""
    val id = session.toString()
    sessions[id] = session
    return id
  }

  @Synchronized
  override fun start(session: String, id: String, command: String, payload: String): String =
    sessions[session]?.let { TauriNativeRust.start(it, id, command, payload) } ?: "{\"error\":\"closed_session\"}"

  @Synchronized
  override fun poll(session: String): String =
    sessions[session]?.let { TauriNativeRust.poll(it) } ?: "{\"error\":\"closed_session\"}"

  @Synchronized
  override fun cancel(session: String, id: String) { sessions[session]?.let { TauriNativeRust.cancel(it, id) } }

  @Synchronized
  override fun closeSession(session: String) { sessions.remove(session)?.let { TauriNativeRust.closeSession(it) } }

  @Synchronized
  override fun invalidate() {
    closed = true
    sessions.values.forEach { TauriNativeRust.closeSession(it) }
    sessions.clear()
    super.invalidate()
  }
}
