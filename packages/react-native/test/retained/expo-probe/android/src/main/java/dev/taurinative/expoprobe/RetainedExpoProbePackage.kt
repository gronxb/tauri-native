package dev.taurinative.expoprobe

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.BasePackage
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.ReactActivityLifecycleListener

class RetainedExpoProbePackage : BasePackage() {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> = listOf(object : ApplicationLifecycleListener {
    override fun onCreate(application: Application) { ProbeState.applicationCreates.incrementAndGet() }
  })
  override fun createReactActivityLifecycleListeners(context: Context): List<ReactActivityLifecycleListener> = listOf(object : ReactActivityLifecycleListener {
    override fun onCreate(activity: Activity, state: Bundle?) { ProbeState.activityCreates.incrementAndGet() }
    override fun onResume(activity: Activity) { ProbeState.resumes.incrementAndGet() }
    override fun onPause(activity: Activity) { ProbeState.pauses.incrementAndGet() }
    override fun onNewIntent(intent: Intent): Boolean { ProbeState.intents.incrementAndGet(); return false }
    override fun onBackPressed(): Boolean { ProbeState.backs.incrementAndGet(); return false }
  })
}
