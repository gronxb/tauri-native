#import "TNLynxComposition.h"
#import "TNRuntimeSession.h"
#import <WebKit/WebKit.h>

static TNLynxComposition *installedComposition;

@implementation TNLynxComposition {
  NSData *_bundle;
  NSString *_url;
  UIView *_container;
  BOOL _closed;
}
+ (instancetype)installWithBundle:(NSURL *)bundle {
  NSAssert(NSThread.isMainThread, @"Install retained Lynx on main, before Tauri starts");
  if (installedComposition) [NSException raise:NSInternalInconsistencyException format:@"Retained Lynx composition is already installed"];
  if (!bundle.isFileURL || ![NSFileManager.defaultManager fileExistsAtPath:bundle.path])
    [NSException raise:NSInvalidArgumentException format:@"Missing bundled retained Lynx renderer"];
  TNLynxComposition *composition = [self new];
  composition->_bundle = [NSData dataWithContentsOfURL:bundle];
  if (!composition->_bundle) [NSException raise:NSInvalidArgumentException format:@"Cannot read bundled retained Lynx renderer"];
  composition->_url = bundle.lastPathComponent;
  installedComposition = composition;
  [NSNotificationCenter.defaultCenter addObserver:composition selector:@selector(launched:) name:UIApplicationDidFinishLaunchingNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:composition selector:@selector(terminated:) name:UIApplicationWillTerminateNotification object:nil];
  return composition;
}
- (void)launched:(NSNotification *)notification { [self attachWhenReady]; }
- (void)terminated:(NSNotification *)notification { [self close]; }
- (void)collectWebviews:(UIView *)view into:(NSMutableArray<WKWebView *> *)webviews {
  if ([view isKindOfClass:WKWebView.class]) { [webviews addObject:(WKWebView *)view]; return; }
  for (UIView *child in view.subviews) [self collectWebviews:child into:webviews];
}
- (void)attachWhenReady {
  if (_closed || _host) return;
  NSDictionary *status = [TNRuntimeSession status];
  if ([@[@"failed", @"closed"] containsObject:status[@"status"]])
    [NSException raise:NSInternalInconsistencyException format:@"Tauri initialization failed: %@", status];
  NSMutableArray<WKWebView *> *webviews = [NSMutableArray new];
  for (UIWindow *window in UIApplication.sharedApplication.windows) [self collectWebviews:window into:webviews];
  if (webviews.count > 1) [NSException raise:NSInternalInconsistencyException format:@"Retained Lynx composition currently requires one original Tauri WKWebView"];
  WKWebView *webview = webviews.firstObject;
  if (![status[@"status"] isEqual:@"ready"] || !webview || ![self isTauriDocumentReady:webview]) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self attachWhenReady]; }); return;
  }
  _container = [self createLynxContainer:webview];
  _host = [[TNLynxHost alloc] initWithContainer:_container bundle:_bundle url:_url];
  [self lynxHostDidAttach];
}
- (BOOL)isTauriDocumentReady:(WKWebView *)webview {
  return !webview.loading && webview.estimatedProgress == 1 && webview.URL && ![webview.URL.absoluteString isEqual:@"about:blank"];
}
- (UIView *)createLynxContainer:(WKWebView *)webview {
  UIView *parent = webview.superview;
  UIView *container = [UIView new]; container.translatesAutoresizingMaskIntoConstraints = NO;
  [parent addSubview:container];
  UILayoutGuide *safeArea = parent.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [container.topAnchor constraintEqualToAnchor:safeArea.topAnchor], [container.bottomAnchor constraintEqualToAnchor:safeArea.bottomAnchor],
    [container.leadingAnchor constraintEqualToAnchor:safeArea.leadingAnchor], [container.trailingAnchor constraintEqualToAnchor:safeArea.trailingAnchor]
  ]];
  [parent layoutIfNeeded];
  return container;
}
- (void)lynxHostDidAttach {}
- (void)reload {
  NSAssert(NSThread.isMainThread, @"Reload retained Lynx on main");
  if (_closed || !_host) [NSException raise:NSInternalInconsistencyException format:@"Retained Lynx surface is not active"];
  [_host reload];
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close retained Lynx on main");
  if (_closed) return;
  _closed = YES;
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [_host close]; _host = nil;
  [_container removeFromSuperview]; _container = nil;
}
@end
