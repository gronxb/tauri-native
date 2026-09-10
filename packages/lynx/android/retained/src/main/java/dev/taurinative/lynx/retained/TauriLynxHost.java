package dev.taurinative.lynx.retained;

import android.app.Application;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebView;
import com.lynx.tasm.LynxEnv;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import com.lynx.tasm.provider.AbsTemplateProvider;
import com.lynx.tasm.behavior.Behavior;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.ui.LynxUI;
import java.util.Collections;

/** Attaches a renderer to a container in the existing Tauri Activity. */
public final class TauriLynxHost implements AutoCloseable {
  private final ViewGroup container;
  private final AbsTemplateProvider templates;
  private final String bundle;
  private LynxView view;
  private TauriRuntimeModule.Scope scope;
  private WebView webview;
  private TauriViewElement.Scope viewScope;
  private boolean foreground;
  private boolean closed;

  public static void initialize(Application application) {
    assertMain();
    if (!LynxEnv.inst().hasInited()) LynxEnv.inst().init(application, null, null, null);
  }

  public TauriLynxHost(ViewGroup container, AbsTemplateProvider templates, String bundle) {
    this(container, null, templates, bundle);
  }

  public TauriLynxHost(ViewGroup container, WebView webview, AbsTemplateProvider templates, String bundle) {
    assertMain();
    this.container = container;
    this.templates = templates;
    this.bundle = bundle;
    this.webview = webview;
    reload();
  }

  /** Retire native subscriptions before destroying the old JS engine. Tauri stays alive. */
  public void reload() {
    assertMain();
    if (closed) throw new IllegalStateException("Lynx host is closed");
    release();
    scope = new TauriRuntimeModule.Scope();
    TauriViewElement.Scope generation = new TauriViewElement.Scope(webview);
    viewScope = generation;
    LynxViewBuilder builder = new LynxViewBuilder();
    builder.registerModule("TauriNativeRuntime", TauriRuntimeModule.class, scope);
    builder.setTemplateProvider(templates);
    builder.addBehaviors(Collections.singletonList(new Behavior("tauri-retained-view", false) {
      @Override public LynxUI createUI(LynxContext context) { return new TauriViewElement(context, generation); }
    }));
    view = builder.build(container.getContext());
    container.addView(view, new ViewGroup.LayoutParams(-1, -1));
    view.renderTemplateUrl(bundle, "");
    if (foreground) view.onEnterForeground();
  }

  public void onResume() { assertMain(); foreground = true; if (view != null) view.onEnterForeground(); }
  public void onPause() { assertMain(); foreground = false; if (view != null) view.onEnterBackground(); }

  private void release() {
    if (scope != null) { scope.close(); scope = null; }
    if (viewScope != null) { viewScope.close(); viewScope = null; }
    if (view != null) { container.removeView(view); view.destroy(); view = null; }
  }

  @Override public void close() { assertMain(); if (!closed) { closed = true; release(); webview = null; } }

  private static void assertMain() {
    if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("Use TauriLynxHost on main");
  }
}
