#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN
/** A Fabric surface in the original Tauri application. Use all methods on main. */
@interface TNReactHost : NSObject
- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;
- (instancetype)initWithContainer:(UIView *)container module:(NSString *)module bundle:(NSURL *)bundle;
- (instancetype)initWithContainer:(UIView *)container module:(NSString *)module bundle:(NSURL *)bundle launchOptions:(nullable NSDictionary *)launchOptions;
/** Forward an incoming application URL after the original Tauri delegate handles it. */
- (void)handleOpenURL:(NSURL *)url;
- (void)reload;
- (void)close;
@end
NS_ASSUME_NONNULL_END
