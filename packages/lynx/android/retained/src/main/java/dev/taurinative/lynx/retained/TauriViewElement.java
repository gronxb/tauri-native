package dev.taurinative.lynx.retained;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.ui.LynxUI;
import com.lynx.tasm.event.LynxCustomEvent;
import java.util.HashMap;

/** Borrows the original Tauri WebView; it never creates or destroys its document. */
final class TauriViewElement extends LynxUI<TauriViewElement.Container> {
  TauriViewElement(LynxContext context, Scope scope) {
    super(context);
    mView.scope = scope;
  }

  @Override protected Container createView(Context context) {
    return new Container(context) {
      @Override void attached(String code) {
        HashMap<String, Object> state = new HashMap<>();
        state.put("type", code == null ? "attached" : "error");
        state.put("code", code == null ? "" : code);
        state.put("message", code == null ? "" : code.equals("view_in_use")
          ? "The original Tauri WebView is already attached" : "This renderer has no available original Tauri WebView");
        getLynxContext().getEventEmitter().sendCustomEvent(new LynxCustomEvent(getSign(), "tauriattachment", state));
      }
    };
  }

  @Override public void destroy() { mView.scope.detach(mView); super.destroy(); }

  static abstract class Container extends FrameLayout {
    Scope scope;
    Container(Context context) { super(context); }
    abstract void attached(String code);
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); attached(scope.attach(this)); }
    @Override protected void onDetachedFromWindow() { scope.detach(this); super.onDetachedFromWindow(); }
  }

  /** Each renderer generation retires before Lynx destroys its view tree. Use on main. */
  static final class Scope {
    private WebView webview;
    private View placeholder;
    private Container container;
    private boolean closed;
    Scope(WebView webview) { this.webview = webview; }

    String attach(Container next) {
      if (closed || webview == null) return "view_unavailable";
      if (container != null && container != next) return "view_in_use";
      if (container == next) return null;
      if (!(webview.getParent() instanceof ViewGroup)) return "view_unavailable";
      ViewGroup parent = (ViewGroup) webview.getParent();
      int index = parent.indexOfChild(webview);
      ViewGroup.LayoutParams layout = webview.getLayoutParams();
      placeholder = new View(parent.getContext());
      parent.removeView(webview);
      parent.addView(placeholder, index, layout);
      container = next;
      container.addView(webview, new FrameLayout.LayoutParams(-1, -1));
      return null;
    }

    void detach(Container previous) {
      if (container == null || container != previous) return;
      ViewGroup parent = (ViewGroup) placeholder.getParent();
      int index = parent.indexOfChild(placeholder);
      ViewGroup.LayoutParams layout = placeholder.getLayoutParams();
      container.removeView(webview);
      parent.removeView(placeholder);
      parent.addView(webview, index, layout);
      container = null; placeholder = null;
    }

    void close() { closed = true; detach(container); webview = null; }
  }
}
