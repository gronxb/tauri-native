package dev.taurinative.react.retained

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.events.Event
import com.facebook.react.viewmanagers.TauriRetainedViewManagerDelegate
import com.facebook.react.viewmanagers.TauriRetainedViewManagerInterface

/** Borrows the original document; Fabric never creates or destroys the Tauri WebView. */
internal class TauriViewManager(private val scope: TauriViewScope) : SimpleViewManager<TauriDocumentContainer>(),
  TauriRetainedViewManagerInterface<TauriDocumentContainer> {
  private val delegate: ViewManagerDelegate<TauriDocumentContainer> = TauriRetainedViewManagerDelegate(this)
  override fun getDelegate() = delegate
  override fun getName() = "TauriRetainedView"
  override fun createViewInstance(context: ThemedReactContext) = TauriDocumentContainer(context, scope)
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
    mapOf("topTauriAttachment" to mapOf("registrationName" to "onTauriAttachment"))
  override fun onDropViewInstance(view: TauriDocumentContainer) {
    scope.detach(view)
    super.onDropViewInstance(view)
  }
}

internal class TauriDocumentContainer(context: ThemedReactContext, private val scope: TauriViewScope) : FrameLayout(context) {
  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val code = scope.attach(this)
    val state = Arguments.createMap().apply {
      putString("type", if (code == null) "attached" else "error")
      putString("code", code ?: "")
      putString("message", when (code) {
        null -> ""
        "view_in_use" -> "The original Tauri WebView is already attached"
        else -> "This renderer has no available original Tauri WebView"
      })
    }
    UIManagerHelper.getEventDispatcherForReactTag(context as ThemedReactContext, id)?.dispatchEvent(
      AttachmentEvent(UIManagerHelper.getSurfaceId(this), id, state))
  }
  override fun onDetachedFromWindow() { scope.detach(this); super.onDetachedFromWindow() }
  private class AttachmentEvent(surfaceId: Int, tag: Int, private val state: WritableMap) : Event<AttachmentEvent>(surfaceId, tag) {
    override fun getEventName() = "topTauriAttachment"
    override fun canCoalesce() = false
    override fun getEventData() = state
  }
}

/** One ReactContext owns this scope and retires it before engine destruction. Use on main. */
internal class TauriViewScope(private var webview: WebView?) {
  private var placeholder: View? = null
  private var container: TauriDocumentContainer? = null
  private var closed = false
  fun attach(next: TauriDocumentContainer): String? {
    val web = webview ?: return "view_unavailable"
    if (closed) return "view_unavailable"
    if (container != null && container !== next) return "view_in_use"
    if (container === next) return null
    val parent = web.parent as? ViewGroup ?: return "view_unavailable"
    val index = parent.indexOfChild(web)
    val layout = web.layoutParams
    val originalPlace = View(parent.context)
    parent.removeView(web)
    parent.addView(originalPlace, index, layout)
    placeholder = originalPlace
    container = next
    next.addView(web, FrameLayout.LayoutParams(-1, -1))
    return null
  }
  fun detach(previous: TauriDocumentContainer?) {
    if (container == null || container !== previous) return
    val originalPlace = placeholder!!
    val parent = originalPlace.parent as ViewGroup
    val index = parent.indexOfChild(originalPlace)
    val layout = originalPlace.layoutParams
    container!!.removeView(webview)
    parent.removeView(originalPlace)
    parent.addView(webview, index, layout)
    container = null; placeholder = null
  }
  fun close() { closed = true; detach(container); webview = null }
}
