#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface TNTauriRustBridge : NSObject

+ (nullable NSString *)invoke:(NSString *)command
                  payloadJSON:(NSString *)payloadJSON;

@end

NS_ASSUME_NONNULL_END
