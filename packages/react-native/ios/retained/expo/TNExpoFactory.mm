#import <ReactCommon/RCTTurboModule.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import "Expo-Swift.h"
#import "TauriNativeReactRetained-Swift.h"

// RN hides its C++ module protocols from Swift. Forward those selectors to the
// same retained delegate that owns actual sessions, Linking and Fabric view scope.
@implementation TNExpoFactoryDelegate (RetainedModules)
- (Class)getModuleClassFromName:(const char *)name {
  return [self.retained getModuleClassFromName:name];
}
- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass {
  return [self.retained getModuleInstanceFromClass:moduleClass];
}
- (NSDictionary<NSString *, Class<RCTComponentViewProtocol>> *)thirdPartyFabricComponents {
  return [self.retained thirdPartyFabricComponents];
}
@end
