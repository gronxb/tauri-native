#import <WebKit/WebKit.h>
#import <Lynx/LynxUI.h>

NS_ASSUME_NONNULL_BEGIN
/** One renderer generation may borrow the original WebView without owning its document. */
@interface TNLynxViewScope : NSObject
- (instancetype)initWithWebView:(nullable WKWebView *)webview;
- (void)close;
@end

@interface TNLynxTauriView : LynxUI<UIView *>
@end
NS_ASSUME_NONNULL_END
