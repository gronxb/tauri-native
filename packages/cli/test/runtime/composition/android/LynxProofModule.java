package dev.taurinative.runtimeproof;

import android.content.Context;
import com.lynx.react.bridge.Callback;
import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxModule;

public final class LynxProofModule extends LynxModule {
  public LynxProofModule(Context context) { super(context); }
  @LynxMethod public void inspect(Callback callback) { RuntimeProof.active.inspect(json -> callback.invoke(json)); }
  @LynxMethod public void remount() { RuntimeProof.active.remount(); }
}
