#import "TNLynxHost.h"
#import "TNLynxRuntimeModule.h"
#import "TNLynxTauriView.h"
#import <Lynx/LynxConfig.h>
#import <Lynx/LynxView.h>
#import <Lynx/LynxViewBuilder.h>

@implementation TNLynxHost {
  UIView *_container;
  NSData *_bundle;
  NSString *_url;
  LynxView *_view;
  TNLynxRuntimeScope *_scope;
  WKWebView *_webview;
  TNLynxViewScope *_viewScope;
  BOOL _closed;
}
- (instancetype)initWithContainer:(UIView *)container bundle:(NSData *)bundle url:(NSString *)url {
  return [self initWithContainer:container webView:nil bundle:bundle url:url];
}
- (instancetype)initWithContainer:(UIView *)container webView:(WKWebView *)webview bundle:(NSData *)bundle url:(NSString *)url {
  NSAssert(NSThread.isMainThread, @"Use TNLynxHost on main");
  if ((self = [super init])) {
    _container = container; _bundle = bundle; _url = [url copy];
    _webview = webview;
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(resumed:) name:UIApplicationDidBecomeActiveNotification object:nil];
    [center addObserver:self selector:@selector(paused:) name:UIApplicationWillResignActiveNotification object:nil];
    [self reload];
  }
  return self;
}
- (void)reload {
  NSAssert(NSThread.isMainThread, @"Reload the Lynx host on main");
  if (_closed) [NSException raise:NSInternalInconsistencyException format:@"Lynx host is closed"];
  [self releaseSurface];
  _scope = [TNLynxRuntimeScope new];
  _viewScope = [[TNLynxViewScope alloc] initWithWebView:_webview];
  LynxConfig *config = [[LynxConfig alloc] initWithProvider:nil];
  [config registerModule:TNLynxRuntimeModule.class param:_scope];
  [config registerUI:TNLynxTauriView.class withName:@"tauri-retained-view"];
  config.contextDict = [@{@"TauriNativeViewScope": _viewScope} mutableCopy];
  CGSize size = _container.bounds.size;
  _view = [[LynxView alloc] initWithBuilderBlock:^(LynxViewBuilder *builder) {
    builder.config = config; builder.screenSize = size; builder.fontScale = 1.0;
  }];
  _view.enableAutoLayout = YES;
  _view.frame = _container.bounds;
  _view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [_container addSubview:_view];
  [_view layoutIfNeeded];
  [_view loadTemplate:_bundle withURL:_url];
  if (UIApplication.sharedApplication.applicationState == UIApplicationStateActive) [_view onEnterForeground];
}
- (void)resumed:(NSNotification *)notification { [_view onEnterForeground]; }
- (void)paused:(NSNotification *)notification { [_view onEnterBackground]; }
- (void)releaseSurface {
  // Close native requests/listeners before the JS engine can be replaced.
  [_scope close]; _scope = nil;
  [_viewScope close]; _viewScope = nil;
  [_view removeFromSuperview]; [_view clearForDestroy]; _view = nil;
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close TNLynxHost on main");
  if (_closed) return;
  _closed = YES;
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self releaseSurface];
  _webview = nil;
}
- (void)dealloc { [self close]; }
@end
