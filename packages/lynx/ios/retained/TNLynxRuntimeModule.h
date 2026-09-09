#import <Foundation/Foundation.h>
#import <Lynx/LynxModule.h>

NS_ASSUME_NONNULL_BEGIN
// One scope per renderer; the host closes it before destroying the Lynx engine.
@interface TNLynxRuntimeScope : NSObject
@property(nonatomic, readonly) BOOL closed;
- (void)close;
@end

@interface TNLynxRuntimeModule : NSObject <LynxModule>
@end
NS_ASSUME_NONNULL_END
