package dev.taurinative.expoprobe

import android.Manifest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicInteger

object ProbeState {
  val created = AtomicInteger(); val destroyed = AtomicInteger(); val callbacks = AtomicInteger()
  val applicationCreates = AtomicInteger(); val activityCreates = AtomicInteger()
  val resumes = AtomicInteger(); val pauses = AtomicInteger(); val intents = AtomicInteger(); val backs = AtomicInteger()
  fun snapshot() = mapOf("created" to ProbeState.created.get(), "destroyed" to ProbeState.destroyed.get(), "callbacks" to ProbeState.callbacks.get(),
        "applicationCreates" to ProbeState.applicationCreates.get(), "activityCreates" to ProbeState.activityCreates.get(),
        "resumes" to ProbeState.resumes.get(), "pauses" to ProbeState.pauses.get(), "intents" to ProbeState.intents.get(), "backs" to ProbeState.backs.get())
}
class RetainedExpoProbeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RetainedExpoProbe")
    OnCreate { ProbeState.created.incrementAndGet() }
    OnDestroy { ProbeState.destroyed.incrementAndGet() }
    Function("snapshot") {
      ProbeState.snapshot()
    }
    AsyncFunction("requestLocation") { promise: Promise ->
      checkNotNull(appContext.permissions).askForPermissions({ result ->
        ProbeState.callbacks.incrementAndGet()
        promise.resolve(result.mapValues { it.value.status.name.lowercase() })
      }, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    }
  }
}
