-keep class dev.taurinative.lynx.TauriNativeRust {
  native <methods>;
}
-keepclassmembers class dev.taurinative.lynx.TauriJavascriptBridge {
  @android.webkit.JavascriptInterface <methods>;
}
