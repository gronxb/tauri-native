package com.reactnativetauri

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NativeTauriSpec.NAME)
internal class TauriNativeModule(
  reactContext: ReactApplicationContext,
) : NativeTauriSpec(reactContext) {
  override fun invoke(command: String, payloadJson: String): String =
    TauriNativeRust.invoke(command, payloadJson)
}
