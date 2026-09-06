package dev.taurinative.lynx;

import android.content.Context;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.LynxElement;
import com.lynx.tasm.behavior.ui.LynxUI;
import com.lynx.tasm.behavior.LynxProp;
import com.lynx.tasm.event.LynxCustomEvent;
import java.util.HashMap;

@LynxElement(name = "tauri-view")
public final class TauriViewElement extends LynxUI<TauriWebView> {
  public TauriViewElement(LynxContext context) {
    super(context);
  }

  @Override
  protected TauriWebView createView(Context context) {
    TauriWebView view = new TauriWebView(context);
    view.setStateListener(state -> getLynxContext().getEventEmitter().sendCustomEvent(new LynxCustomEvent(getSign(), "tauristate", new HashMap<>(state))));
    return view;
  }

  @LynxProp(name = "path")
  public void setPath(String value) { mView.setLocalPath(value); }

  @LynxProp(name = "message-json")
  public void setMessageJson(String value) { mView.sendMessage(value); }

  @Override
  public void destroy() {
    if (mView != null) mView.destroy();
    super.destroy();
  }
}
