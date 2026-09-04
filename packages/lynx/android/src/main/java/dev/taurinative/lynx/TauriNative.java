package dev.taurinative.lynx;

import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxNativeModule;
import com.lynx.tasm.behavior.LynxContext;
import dev.taurinative.lynx.generated.TauriNativeSpec;

@LynxNativeModule(name = "TauriNative")
public final class TauriNative extends TauriNativeSpec {
  public TauriNative(LynxContext context) {
    super(context);
  }

  @Override
  @LynxMethod
  public String invoke(String command, String payloadJson) {
    return TauriNativeRust.invoke(command, payloadJson);
  }
}
