package dev.taurinative.react.retained;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import java.util.ArrayList;
import java.util.Collections;

/** Owned by one ReactHost. Retire modules before that host destroys its engine. */
final class TauriRuntimePackage extends BaseReactPackage {
  private final ArrayList<TauriRuntimeModule> modules = new ArrayList<>();

  @Override public synchronized NativeModule getModule(String name, ReactApplicationContext context) {
    if (!name.equals(NativeTauriRuntimeSpec.NAME)) return null;
    TauriRuntimeModule module = new TauriRuntimeModule(context);
    modules.add(module);
    return module;
  }

  @Override public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> Collections.singletonMap(NativeTauriRuntimeSpec.NAME,
      new ReactModuleInfo(NativeTauriRuntimeSpec.NAME, TauriRuntimeModule.class.getName(), false, false, false, true));
  }

  synchronized void retire() { for (TauriRuntimeModule module : modules) module.retire(); modules.clear(); }
}
