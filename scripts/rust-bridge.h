#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface __TAURI_NATIVE_OBJC_BRIDGE__ : NSObject

+ (nullable NSString *)invoke:(NSString *)command
                  payloadJSON:(NSString *)payloadJSON;
+ (uint64_t)createSession;
+ (NSString *)start:(uint64_t)session requestID:(NSString *)requestID command:(NSString *)command payloadJSON:(NSString *)payload;
+ (NSString *)poll:(uint64_t)session;
+ (void)cancel:(uint64_t)session requestID:(NSString *)requestID;
+ (void)closeSession:(uint64_t)session;

@end

NS_ASSUME_NONNULL_END
