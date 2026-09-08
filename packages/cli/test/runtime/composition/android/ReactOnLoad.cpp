#include <DefaultTurboModuleManagerDelegate.h>
#include <FBReactNativeSpec.h>
#include <fbjni/fbjni.h>

// The minimal RN app entry registers its real core Java TurboModule provider.
// This is the same registration used by RN's standard OnLoad.cpp template.
JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
      &facebook::react::FBReactNativeSpec_ModuleProvider;
  });
}
