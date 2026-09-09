#import <Foundation/Foundation.h>
#import <React/RCTInvalidating.h>
#import "TauriNativeRetainedSpec.h"

NS_ASSUME_NONNULL_BEGIN
@interface TNReactRuntimeScope : NSObject
@property(nonatomic, readonly) BOOL closed;
- (void)close;
@end

// Factory-scoped generated TurboModule, never registered as a global singleton.
@interface TNReactRuntimeModule : NSObject <NativeTauriRuntimeSpec, RCTInvalidating>
- (void)retire;
@end
NS_ASSUME_NONNULL_END
