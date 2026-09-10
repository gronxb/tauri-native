#import "TNLynxTauriView.h"
#import <Lynx/LynxEventEmitter.h>
#import <Lynx/LynxUIContext.h>

@interface TNLynxViewScope ()
- (nullable NSString *)attach:(UIView *)container;
- (void)detach:(UIView *)container;
- (void)layout:(UIView *)container;
@end

@implementation TNLynxViewScope {
  WKWebView *_webview;
  UIView *_placeholder;
  __weak UIView *_container;
  BOOL _closed;
}
- (instancetype)initWithWebView:(WKWebView *)webview {
  if ((self = [super init])) _webview = webview;
  return self;
}
- (NSString *)attach:(UIView *)container {
  if (_closed || !_webview) return @"view_unavailable";
  if (_container && _container != container) return @"view_in_use";
  if (_container == container) return nil;
  UIView *parent = _webview.superview;
  if (!parent || !_webview.translatesAutoresizingMaskIntoConstraints) return @"view_unavailable";
  _placeholder = [[UIView alloc] initWithFrame:_webview.frame];
  _placeholder.autoresizingMask = _webview.autoresizingMask;
  _placeholder.userInteractionEnabled = NO;
  [parent insertSubview:_placeholder belowSubview:_webview];
  _container = container;
  [container addSubview:_webview];
  _webview.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [self layout:container];
  return nil;
}
- (void)layout:(UIView *)container {
  if (_container == container) _webview.frame = container.bounds;
}
- (void)detach:(UIView *)container {
  if (!_container || _container != container) return;
  [_placeholder.superview insertSubview:_webview aboveSubview:_placeholder];
  _webview.frame = _placeholder.frame;
  _webview.autoresizingMask = _placeholder.autoresizingMask;
  [_placeholder removeFromSuperview]; _placeholder = nil;
  _container = nil;
}
- (void)close { _closed = YES; [self detach:_container]; _webview = nil; }
@end

@interface TNLynxDocumentContainer : UIView
@property(nonatomic) TNLynxViewScope *scope;
@property(nonatomic, copy) TNLynxViewScope *(^resolveScope)(void);
@property(nonatomic, copy) void (^attachment)(NSDictionary *);
@end
@implementation TNLynxDocumentContainer
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (!self.window) { [self.scope detach:self]; return; }
  if (!self.scope) self.scope = self.resolveScope();
  NSString *code = [self.scope attach:self] ?: (self.scope ? nil : @"view_unavailable");
  if (self.attachment) self.attachment(@{@"type": code ? @"error" : @"attached", @"code": code ?: @"",
    @"message": !code ? @"" : [code isEqual:@"view_in_use"] ? @"The original Tauri WebView is already attached" : @"This renderer has no available original Tauri WebView"});
}
- (void)layoutSubviews { [super layoutSubviews]; [self.scope layout:self]; }
@end

@implementation TNLynxTauriView
- (UIView *)createView {
  TNLynxDocumentContainer *view = [TNLynxDocumentContainer new];
  view.clipsToBounds = YES;
  __weak TNLynxTauriView *weakSelf = self;
  // Lynx assigns the UI context after createView, before inserting the native view.
  view.resolveScope = ^{ return (TNLynxViewScope *)weakSelf.context.contextDict[@"TauriNativeViewScope"]; };
  view.attachment = ^(NSDictionary *state) {
    TNLynxTauriView *element = weakSelf;
    if (element) [element.context.eventEmitter sendCustomEvent:[[LynxDetailEvent alloc]
      initWithName:@"tauriattachment" targetSign:element.sign detail:state]];
  };
  return view;
}
@end
