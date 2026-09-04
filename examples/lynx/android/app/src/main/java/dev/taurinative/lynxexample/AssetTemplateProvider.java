package dev.taurinative.lynxexample;

import android.content.Context;
import com.lynx.tasm.provider.AbsTemplateProvider;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

final class AssetTemplateProvider extends AbsTemplateProvider {
  private final Context context;

  AssetTemplateProvider(Context context) {
    this.context = context.getApplicationContext();
  }

  @Override
  public void loadTemplate(String uri, Callback callback) {
    new Thread(() -> {
      try (
        InputStream input = context.getAssets().open(uri);
        ByteArrayOutputStream output = new ByteArrayOutputStream()
      ) {
        byte[] buffer = new byte[8192];
        int length;
        while ((length = input.read(buffer)) != -1) {
          output.write(buffer, 0, length);
        }
        callback.onSuccess(output.toByteArray());
      } catch (IOException error) {
        callback.onFailed(
          error.getMessage() == null ? "Unable to load " + uri : error.getMessage()
        );
      }
    }, "lynx-template-loader").start();
  }
}
