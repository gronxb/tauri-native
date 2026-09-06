-keep class com.reactnativetauri.TauriNativeRust {
  native <methods>;
}
-keepclassmembers class com.reactnativetauri.TauriJavascriptBridge {
  @android.webkit.JavascriptInterface <methods>;
}
