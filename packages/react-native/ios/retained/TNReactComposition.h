#import <UIKit/UIKit.h>
#import "TNReactHost.h"
@class WKWebView;

NS_ASSUME_NONNULL_BEGIN
/** One RN composition under the original Tauri application. All methods run on main. */
@interface TNReactComposition : NSObject
+ (instancetype)installWithModule:(NSString *)module bundle:(NSURL *)bundle;
@property(nonatomic, readonly, nullable) TNReactHost *host;
- (void)reload;
- (void)close;
/** Consumer native layout/readiness hooks; default integration needs no overrides. */
- (BOOL)isTauriDocumentReady:(WKWebView *)webview;
- (UIView *)createReactContainer:(WKWebView *)webview;
- (void)reactHostDidAttach;
@end
NS_ASSUME_NONNULL_END
