#include <DefaultTurboModuleManagerDelegate.h>
#include <DefaultComponentsRegistry.h>
#include <react/renderer/components/TauriNativeRetainedSpec/ComponentDescriptors.h>
#include <FBReactNativeSpec.h>
#include <TauriNativeRetainedSpec.h>
#include <autolinking.h>
#include <fbjni/fbjni.h>

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM *vm, void *) {
  return facebook::jni::initialize(vm, [] {
    facebook::react::DefaultComponentsRegistry::registerComponentDescriptorsFromEntryPoint =
      [](std::shared_ptr<const facebook::react::ComponentDescriptorProviderRegistry> registry) {
        registry->add(facebook::react::concreteComponentDescriptorProvider<facebook::react::TauriRetainedViewComponentDescriptor>());
        facebook::react::autolinking_registerProviders(registry);
      };
    facebook::react::DefaultTurboModuleManagerDelegate::cxxModuleProvider = facebook::react::autolinking_cxxModuleProvider;
    facebook::react::DefaultTurboModuleManagerDelegate::javaModuleProvider =
      [](const std::string &name, const facebook::react::JavaTurboModule::InitParams &params) {
        auto module = facebook::react::TauriNativeRetainedSpec_ModuleProvider(name, params);
        if (module) return module;
        module = facebook::react::FBReactNativeSpec_ModuleProvider(name, params);
        return module ? module : facebook::react::autolinking_ModuleProvider(name, params);
      };
  });
}
