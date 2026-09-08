package dev.taurinative.runtimeproof;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

public class ReactProofPackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.singletonList(new Module(context));
  }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }

  public static class Module extends ReactContextBaseJavaModule {
    Module(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "RuntimeProof"; }
    @ReactMethod public void inspect(Callback callback) { RuntimeProof.active.inspect(json -> callback.invoke(json)); }
    @ReactMethod public void remount() { RuntimeProof.active.remount(); }
  }
}
