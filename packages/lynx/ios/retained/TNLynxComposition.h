#import <UIKit/UIKit.h>
#import "TNLynxHost.h"
@class WKWebView;

NS_ASSUME_NONNULL_BEGIN
/** One Lynx composition under the original Tauri application. All methods run on main. */
@interface TNLynxComposition : NSObject
+ (instancetype)installWithBundle:(NSURL *)bundle;
@property(nonatomic, readonly, nullable) TNLynxHost *host;
- (void)reload;
- (void)close;
/** Consumer native layout/readiness hooks; default integration needs no overrides. */
- (BOOL)isTauriDocumentReady:(WKWebView *)webview;
- (UIView *)createLynxContainer:(WKWebView *)webview;
- (void)lynxHostDidAttach;
@end
NS_ASSUME_NONNULL_END
