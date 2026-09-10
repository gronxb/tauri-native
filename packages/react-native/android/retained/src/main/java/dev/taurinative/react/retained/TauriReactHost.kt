package dev.taurinative.react.retained

import android.app.Application
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.JSBundleLoader
import com.facebook.react.bridge.ReactContext
import com.facebook.react.common.annotations.UnstableReactNativeAPI
import com.facebook.react.defaults.DefaultComponentsRegistry
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactHostDelegate
import com.facebook.react.defaults.DefaultTurboModuleManagerDelegate
import com.facebook.react.fabric.ComponentFactory
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import com.facebook.react.modules.core.PermissionListener
import com.facebook.react.runtime.ReactHostImpl
import com.facebook.react.runtime.ReactHostDelegate
import com.facebook.react.shell.MainReactPackage
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader

/** One RN engine/surface in an existing Tauri Activity. Lifecycle methods run on main. */
@OptIn(UnstableReactNativeAPI::class)
class TauriReactHost(
  private val activity: ComponentActivity,
  private val container: ViewGroup,
  module: String,
  bundle: String,
  webView: WebView?,
  private val permissions: TauriReactPermissions?,
  delegate: ReactHostDelegate?,
  prepareHost: ((ReactHostImpl) -> Unit)?,
  private val onBack: (() -> Boolean)?,
) : AutoCloseable {
  // Keep the ordinary entry point independent of RN's unstable host extension types.
  @JvmOverloads constructor(
    activity: ComponentActivity,
    container: ViewGroup,
    module: String,
    bundle: String,
    webView: WebView? = null,
    permissions: TauriReactPermissions? = null,
  ) : this(activity, container, module, bundle, webView, permissions, null, null, null)

  private val runtimePackage = TauriRuntimePackage(webView)
  private val configuredDelegate = delegate ?: DefaultReactHostDelegate(jsMainModulePath = "index",
    jsBundleLoader = JSBundleLoader.createAssetLoader(activity.applicationContext, "assets://$bundle", true),
    reactPackages = listOf(MainReactPackage()),
    turboModuleManagerDelegateBuilder = DefaultTurboModuleManagerDelegate.Builder())
  private val reactHost = ReactHostImpl(activity.applicationContext,
    object : ReactHostDelegate by configuredDelegate {
      override val reactPackages get() = configuredDelegate.reactPackages + runtimePackage
    },
    ComponentFactory().also { DefaultComponentsRegistry.register(it) }, false, false)
  private val surface = reactHost.createSurface(activity, module, null)
  private val back = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val handled = onBack?.invoke() ?: false
      if (!reactHost.onBackPressed() && !handled) defaultBack()
    }
  }
  private var closed = false
  @Volatile private var permissionScope: TauriReactPermissions.Scope? = null
  var destroyed = false
    private set

  init {
    checkMain()
    // RN 0.86 invokes this listener on UI before destroying ReactContext/JSI.
    reactHost.addBeforeDestroyListener { retireRenderer() }
    reactHost.addReactInstanceEventListener(object : ReactInstanceEventListener {
      override fun onReactContextInitialized(context: ReactContext) {
        if (!closed) permissionScope = permissions?.openScope()
      }
    })
    prepareHost?.invoke(reactHost)
    activity.onBackPressedDispatcher.addCallback(activity, back)
    container.addView(surface.view, ViewGroup.LayoutParams(-1, -1))
    surface.start()
  }

  fun reload() {
    checkMain(); check(!closed) { "RN host is closed" }
    retireRenderer()
    reactHost.reload("Retained Tauri renderer reload")
  }
  private fun defaultBack() {
    back.isEnabled = false
    try { activity.onBackPressedDispatcher.onBackPressed() } finally { back.isEnabled = !closed }
  }
  fun onResume() {
    checkMain()
    if (!closed) reactHost.onHostResume(activity, object : DefaultHardwareBackBtnHandler {
      override fun invokeDefaultOnBackPressed() { defaultBack() }
    })
    if (!closed) permissions?.onResume()
  }
  fun onPause() { checkMain(); if (!closed) { permissions?.onPause(); reactHost.onHostPause(activity) } }
  /** Called by the Activity's PermissionAwareActivity overload, possibly from RN's module queue. */
  fun requestPermissions(requested: Array<String>, code: Int, listener: PermissionListener?) {
    val scope = checkNotNull(permissionScope) { "RN permission scope is not ready or has retired" }
    val copy = requested.copyOf()
    Handler(Looper.getMainLooper()).post { scope.request(copy, code, listener) }
  }
  fun onNewIntent(intent: Intent) { checkMain(); if (!closed) reactHost.onNewIntent(intent) }
  fun onActivityResult(request: Int, result: Int, data: Intent?) { checkMain(); if (!closed) reactHost.onActivityResult(activity, request, result, data) }
  fun onWindowFocusChanged(focused: Boolean) { checkMain(); if (!closed) reactHost.onWindowFocusChange(focused) }
  fun onConfigurationChanged() { checkMain(); if (!closed) reactHost.onConfigurationChanged(activity) }

  override fun close() {
    checkMain()
    if (closed) return
    closed = true
    back.remove()
    retireRenderer()
    container.removeView(surface.view)
    reactHost.onHostDestroy(activity)
    reactHost.destroy("Retained Tauri renderer removed", null) { success ->
      Handler(Looper.getMainLooper()).post {
        check(success) { "RN engine destruction failed" }
        surface.clear(); surface.detach(); reactHost.invalidate()
        destroyed = true
      }
    }
  }

  private fun retireRenderer() {
    permissionScope?.close(); permissionScope = null
    runtimePackage.retire()
  }

  companion object {
    private var initialized = false
    @JvmStatic fun initialize(application: Application) {
      checkMain()
      if (initialized) return
      SoLoader.init(application, OpenSourceMergedSoMapping)
      DefaultNewArchitectureEntryPoint.load()
      initialized = true
    }
    private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Use TauriReactHost on main" } }
  }
}
