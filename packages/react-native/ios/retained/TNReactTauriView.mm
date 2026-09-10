#import "TNReactTauriView.h"
#import <objc/runtime.h>
#import <react/renderer/components/TauriNativeRetainedSpec/ComponentDescriptors.h>
#import <react/renderer/components/TauriNativeRetainedSpec/Props.h>
#import <react/renderer/components/TauriNativeRetainedSpec/EventEmitters.h>

using namespace facebook::react;
static char TNReactViewScopeKey;

@interface TNReactViewScope ()
- (nullable NSString *)attach:(UIView *)container;
- (void)detach:(UIView *)container;
- (void)layout:(UIView *)container;
@end

@implementation TNReactViewScope {
  WKWebView *_webview;
  UIView *_placeholder;
  __weak UIView *_container;
  BOOL _closed;
}
- (instancetype)initWithWebView:(WKWebView *)webview {
  if ((self = [super init])) _webview = webview;
  return self;
}
- (void)bindToSurface:(UIView *)surface {
  objc_setAssociatedObject(surface, &TNReactViewScopeKey, self, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
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
- (void)layout:(UIView *)container { if (_container == container) _webview.frame = container.bounds; }
- (void)detach:(UIView *)container {
  if (!_container || _container != container) return;
  [_placeholder.superview insertSubview:_webview aboveSubview:_placeholder];
  _webview.frame = _placeholder.frame;
  _webview.autoresizingMask = _placeholder.autoresizingMask;
  [_placeholder removeFromSuperview]; _placeholder = nil; _container = nil;
}
- (void)close { _closed = YES; [self detach:_container]; _webview = nil; }
@end

@interface TNReactDocumentContainer : UIView
@property(nonatomic) TNReactViewScope *scope;
@property(nonatomic, copy) void (^attachment)(NSString *);
- (void)retire;
@end
@implementation TNReactDocumentContainer
- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (!self.window) { [self.scope detach:self]; return; }
  if (!self.scope) {
    for (UIView *parent = self.superview; parent; parent = parent.superview) {
      self.scope = objc_getAssociatedObject(parent, &TNReactViewScopeKey);
      if (self.scope) break;
    }
  }
  NSString *code = self.scope ? [self.scope attach:self] : @"view_unavailable";
  if (self.attachment) self.attachment(code);
}
- (void)layoutSubviews { [super layoutSubviews]; [self.scope layout:self]; }
- (void)retire { [self.scope detach:self]; self.scope = nil; }
@end

@implementation TNReactTauriView
+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<TauriRetainedViewComponentDescriptor>();
}
- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const TauriRetainedViewProps>();
    TNReactDocumentContainer *container = [TNReactDocumentContainer new];
    container.clipsToBounds = YES;
    __weak TNReactTauriView *weakSelf = self;
    container.attachment = ^(NSString *code) {
      TNReactTauriView *view = weakSelf;
      if (!view || !view->_eventEmitter) return;
      auto emitter = std::static_pointer_cast<const TauriRetainedViewEventEmitter>(view->_eventEmitter);
      NSString *message = !code ? @"" : [code isEqual:@"view_in_use"]
        ? @"The original Tauri WebView is already attached" : @"This renderer has no available original Tauri WebView";
      emitter->onTauriAttachment({.type = code ? "error" : "attached", .code = (code ?: @"").UTF8String, .message = message.UTF8String});
    };
    self.contentView = container;
  }
  return self;
}
- (void)prepareForRecycle {
  // Fabric's class registry/recycle pool is global; ownership belongs to the mounted surface.
  [(TNReactDocumentContainer *)self.contentView retire];
  [super prepareForRecycle];
}
@end
