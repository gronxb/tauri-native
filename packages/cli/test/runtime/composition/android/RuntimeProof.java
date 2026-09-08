package dev.taurinative.runtimeproof;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.function.Consumer;

/** Test-only native controller. All application requests still enter real Tauri WebView IPC. */
public final class RuntimeProof {
  public static RuntimeProof active;
  final Activity activity;
  final WebView webview;
  final Runnable remount;
  final Handler main = new Handler(Looper.getMainLooper());
  final HashMap<Integer, Consumer<String>> pending = new HashMap<>();
  final JSONObject report = new JSONObject();
  int generation = 0;
  int released = 0;
  int resumed = 0;
  int paused = 0;
  int stopped = 0;
  int sequence = 0;
  int completed = 0;
  String script;

  RuntimeProof(Activity activity, WebView webview, Runnable remount) {
    this.activity = activity;
    this.webview = webview;
    this.remount = remount;
    try (java.io.InputStream input = activity.getAssets().open("composition-probe.js")) {
      script = new String(input.readAllBytes(), StandardCharsets.UTF_8);
    } catch (Exception error) { throw new RuntimeException(error); }
    webview.addJavascriptInterface(this, "RuntimeProofResult");
    active = this;
  }

  File file(String name) { return new File(activity.getApplicationInfo().dataDir, name); }

  void awaitBaseline(Runnable ready) {
    if (file("runtime-report.json").isFile()) ready.run();
    else main.postDelayed(() -> awaitBaseline(ready), 100);
  }

  void mounted() { generation++; persist(); }
  void released() { released++; pending.clear(); persist(); }
  void resumed() { resumed++; persist(); }
  void paused() { paused++; persist(); }
  void stopped() { stopped++; persist(); }

  public void inspect(Consumer<String> callback) {
    main.post(() -> awaitBaseline(() -> {
      int id = ++sequence;
      int owner = generation;
      pending.put(id, json -> { if (owner == generation) callback.accept(json); });
      webview.evaluateJavascript("(" + script + ")(" + id + ")", null);
    }));
  }

  public void remount() { main.post(remount); }

  void close() { main.removeCallbacksAndMessages(null); pending.clear(); webview.removeJavascriptInterface("RuntimeProofResult"); active = null; }

  @JavascriptInterface public void complete(String json) {
    main.post(() -> {
      try {
        JSONObject value = new JSONObject(json);
        Consumer<String> callback = pending.remove(value.getInt("id"));
        if (callback == null) return;
        value.put("generation", generation);
        completed++;
        report.put("lastProbe", value);
        persist();
        callback.accept(value.toString());
      } catch (Exception error) { throw new RuntimeException(error); }
    });
  }

  void persist() {
    try {
      report.put("generation", generation).put("released", released).put("resumed", resumed)
        .put("paused", paused).put("stopped", stopped).put("completed", completed)
        .put("activity", activity.getClass().getName()).put("pid", android.os.Process.myPid());
      File temporary = file("composition-report.tmp");
      Files.write(temporary.toPath(), report.toString().getBytes(StandardCharsets.UTF_8));
      Files.move(temporary.toPath(), file("composition-report.json").toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    } catch (Exception error) { throw new RuntimeException(error); }
  }
}
