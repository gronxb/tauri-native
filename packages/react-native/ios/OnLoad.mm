#import <Foundation/Foundation.h>
#import <ReactCommon/CxxTurboModuleUtils.h>

#import "TauriNativeImpl.h"

@interface TauriNativeOnLoad : NSObject
@end

@implementation TauriNativeOnLoad

using namespace facebook::react;

+ (void)load
{
  registerCxxModuleToGlobalModuleMap(
    std::string(TauriNativeImpl::kModuleName),
    [](std::shared_ptr<CallInvoker> jsInvoker) {
      return std::make_shared<TauriNativeImpl>(std::move(jsInvoker));
    }
  );
}

@end
