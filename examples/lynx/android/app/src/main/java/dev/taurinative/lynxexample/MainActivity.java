package dev.taurinative.lynxexample;

import android.app.Activity;
import android.os.Bundle;
import com.lynx.tasm.LynxView;
import com.lynx.tasm.LynxViewBuilder;
import com.lynx.xelement.XElementBehaviors;

public final class MainActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    LynxViewBuilder builder = new LynxViewBuilder();
    builder.addBehaviors(new XElementBehaviors().create());
    builder.setTemplateProvider(new AssetTemplateProvider(this));

    LynxView lynxView = builder.build(this);
    setContentView(lynxView);
    lynxView.renderTemplateUrl("main.lynx.bundle", "");
  }
}
