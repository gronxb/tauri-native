#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
typedef void (^TNRuntimeCompletion)(NSDictionary *result);

// A renderer-owned session in the existing Tauri application. Use on the main thread.
@interface TNRuntimeSession : NSObject
+ (NSDictionary *)status;
- (nullable instancetype)initWithCaller:(NSString *)caller error:(NSError * _Nullable * _Nullable)error;
- (NSNumber *)invoke:(NSString *)command payload:(NSDictionary *)payload completion:(TNRuntimeCompletion)completion;
// Completion contains the subscription ID; cancel the request to abandon registration.
- (NSNumber *)listen:(NSString *)event completion:(TNRuntimeCompletion)completion;
// Each batch rechecks the original live WebView origin and Tauri capability.
- (NSNumber *)pollEvents:(TNRuntimeCompletion)completion;
- (BOOL)unlisten:(NSNumber *)subscription;
- (void)cancel:(NSNumber *)request;
- (void)close;
@end
NS_ASSUME_NONNULL_END
