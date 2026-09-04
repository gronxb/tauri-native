package com.reactnativetauri

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.viewmanagers.TauriViewManagerDelegate
import com.facebook.react.viewmanagers.TauriViewManagerInterface

internal class TauriViewManager : SimpleViewManager<TauriWebView>(),
  TauriViewManagerInterface<TauriWebView> {
  private val delegate: ViewManagerDelegate<TauriWebView> =
    TauriViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<TauriWebView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext) =
    TauriWebView(context)

  override fun onDropViewInstance(view: TauriWebView) {
    view.removeJavascriptInterface(TauriWebView.BRIDGE_NAME)
    view.destroy()
    super.onDropViewInstance(view)
  }

  private companion object {
    const val REACT_CLASS = "TauriView"
  }
}
