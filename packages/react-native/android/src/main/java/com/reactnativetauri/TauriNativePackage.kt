package com.reactnativetauri

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.ModuleSpec
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class TauriNativePackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? = when (name) {
    NativeTauriSpec.NAME -> TauriNativeModule(reactContext)
    else -> null
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      NativeTauriSpec.NAME to ReactModuleInfo(
        NativeTauriSpec.NAME,
        TauriNativeModule::class.java.name,
        false,
        false,
        false,
        true,
      )
    )
  }

  override fun getViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ModuleSpec> = listOf(
    ModuleSpec.viewManagerSpec { TauriViewManager() }
  )
}
