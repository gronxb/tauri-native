package dev.taurinative.lynxexample;

import android.app.Activity;
import android.os.Bundle;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import com.lynx.tasm.behavior.Behavior;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.shadow.ShadowNode;
import com.lynx.tasm.behavior.ui.LynxUI;
import com.lynx.xelement.input.LynxUIInput;
import com.lynx.xelement.input.LynxUIInputShadowNode;
import java.util.Collections;

public final class MainActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    LynxViewBuilder builder = new LynxViewBuilder();
    builder.addBehaviors(Collections.singletonList(new Behavior("input", false, false, false) {
      @Override public LynxUI createUI(LynxContext context) { return new LynxUIInput(context); }
      @Override public ShadowNode createShadowNode() { return new LynxUIInputShadowNode(); }
    }));
    builder.setTemplateProvider(new AssetTemplateProvider(this));

    LynxView lynxView = builder.build(this);
    setContentView(lynxView);
    lynxView.renderTemplateUrl("main.lynx.bundle", "");
  }
}
