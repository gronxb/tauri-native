#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
/** A renderer in the original Tauri application. Create, reload and close on main. */
@interface TNLynxHost : NSObject
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
- (instancetype)initWithContainer:(UIView *)container bundle:(NSData *)bundle url:(NSString *)url;
- (void)reload;
- (void)close;
@end
NS_ASSUME_NONNULL_END
