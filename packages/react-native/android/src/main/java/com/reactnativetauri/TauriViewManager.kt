package com.reactnativetauri

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.Event
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.viewmanagers.TauriViewManagerDelegate
import com.facebook.react.viewmanagers.TauriViewManagerInterface

internal class TauriViewManager : SimpleViewManager<TauriWebView>(),
  TauriViewManagerInterface<TauriWebView> {
  private val delegate: ViewManagerDelegate<TauriWebView> =
    TauriViewManagerDelegate(this)

  override fun getDelegate(): ViewManagerDelegate<TauriWebView> = delegate

  override fun getName(): String = REACT_CLASS

  override fun createViewInstance(context: ThemedReactContext) = TauriWebView(context).also { view ->
    view.setStateListener { state ->
      UIManagerHelper.getEventDispatcherForReactTag(context, view.id)?.dispatchEvent(
        StateEvent(UIManagerHelper.getSurfaceId(view), view.id, state),
      )
    }
  }

  @ReactProp(name = "path")
  override fun setPath(view: TauriWebView, value: String?) { view.setLocalPath(value) }

  @ReactProp(name = "messageJson")
  override fun setMessageJson(view: TauriWebView, value: String?) { view.sendMessage(value) }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
    mapOf("topTauriState" to mapOf("registrationName" to "onTauriState"))

  private class StateEvent(surfaceId: Int, viewTag: Int, private val state: Map<String, String>) : Event<StateEvent>(surfaceId, viewTag) {
    override fun getEventName(): String = "topTauriState"
    override fun canCoalesce(): Boolean = false
    override fun getEventData(): WritableMap = Arguments.createMap().apply {
      for ((key, value) in state) putString(key, value)
    }
  }

  override fun onDropViewInstance(view: TauriWebView) {
    view.removeJavascriptInterface(TauriWebView.BRIDGE_NAME)
    view.destroy()
    super.onDropViewInstance(view)
  }

  private companion object {
    const val REACT_CLASS = "TauriView"
  }
}
