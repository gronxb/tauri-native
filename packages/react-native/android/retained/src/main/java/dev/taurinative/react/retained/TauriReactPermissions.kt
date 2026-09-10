package dev.taurinative.react.retained

import android.content.pm.PackageManager
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.facebook.react.modules.core.PermissionListener
import java.util.ArrayDeque

/** Register during Activity creation, before STARTED. The original Tauri permission launchers remain independent. */
class TauriReactPermissions(activity: ComponentActivity) {
  private class Request(val scope: Scope, val permissions: Array<String>, val code: Int, var listener: PermissionListener?) {
    var result: IntArray? = null
  }
  private val queued = ArrayDeque<Request>()
  private var current: Request? = null
  private var resumed = false
  private val launcher = activity.activityResultRegistry.register(
    "tauri-native-react:permissions", activity, ActivityResultContracts.RequestMultiplePermissions(),
  ) { grants ->
    current?.let { request ->
      request.result = request.permissions.map {
        if (grants[it] == true) PackageManager.PERMISSION_GRANTED else PackageManager.PERMISSION_DENIED
      }.toIntArray()
    }
    drain()
  }

  internal inner class Scope {
    @Volatile var closed = false
      private set

    fun request(permissions: Array<String>, code: Int, listener: PermissionListener?) {
      checkMain()
      if (closed) return
      queued.addLast(Request(this, permissions.copyOf(), code, listener))
      drain()
    }
    fun close() {
      checkMain()
      if (closed) return
      closed = true
      queued.removeAll { it.scope === this }
      // Keep the OS request occupied until its result arrives, without retaining the old JS listener.
      current?.takeIf { it.scope === this }?.listener = null
      drain()
    }
  }
  internal fun openScope(): Scope { checkMain(); return Scope() }
  internal fun onResume() { checkMain(); resumed = true; drain() }
  internal fun onPause() { checkMain(); resumed = false }

  private fun drain() {
    val request = current
    if (request?.result != null && (resumed || request.listener == null)) {
      current = null
      request.listener?.onRequestPermissionsResult(request.code, request.permissions, request.result!!)
    }
    if (current == null && resumed && queued.isNotEmpty()) {
      current = queued.removeFirst()
      launcher.launch(current!!.permissions)
    }
  }
  private fun checkMain() { check(Looper.myLooper() == Looper.getMainLooper()) { "Use TauriReactPermissions on main" } }
}
