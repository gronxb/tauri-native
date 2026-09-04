package dev.taurinative.lynx;

import android.content.Context;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.LynxElement;
import com.lynx.tasm.behavior.ui.LynxUI;

@LynxElement(name = "tauri-view")
public final class TauriViewElement extends LynxUI<TauriWebView> {
  public TauriViewElement(LynxContext context) {
    super(context);
  }

  @Override
  protected TauriWebView createView(Context context) {
    return new TauriWebView(context);
  }
}
