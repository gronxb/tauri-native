#import <WebKit/WebKit.h>
#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN
/** A single Fabric generation may borrow the original Tauri document. */
@interface TNReactViewScope : NSObject
- (instancetype)initWithWebView:(nullable WKWebView *)webview;
- (void)bindToSurface:(UIView *)surface;
- (void)close;
@end

@interface TNReactTauriView : RCTViewComponentView
@end
NS_ASSUME_NONNULL_END
