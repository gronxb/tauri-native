#include <DefaultTurboModuleManagerDelegate.h>
#include <FBReactNativeSpec.h>
#include <TauriNativeRetainedSpec.h>
#include <fbjni/fbjni.h>

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
      [](const std::string &name, const facebook::react::JavaTurboModule::InitParams &params) {
        auto module = facebook::react::TauriNativeRetainedSpec_ModuleProvider(name, params);
        return module ? module : facebook::react::FBReactNativeSpec_ModuleProvider(name, params);
      };
  });
}
