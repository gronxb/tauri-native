#import "TNReactComposition.h"
#import "TNRuntimeSession.h"
#import <WebKit/WebKit.h>
#import <objc/runtime.h>

static TNReactComposition *installedComposition;
static __weak TNReactComposition *urlRecipient;
static Method openURLMethod, userActivityMethod;
static IMP originalOpenURL, originalUserActivity;

@interface TNReactComposition ()
- (void)receivedURL:(NSURL *)url;
@end

static BOOL openURL(id delegate, SEL selector, UIApplication *app, NSURL *url, NSDictionary *options) {
  BOOL handled = ((BOOL (*)(id, SEL, UIApplication *, NSURL *, NSDictionary *))originalOpenURL)(delegate, selector, app, url, options);
  [urlRecipient receivedURL:url];
  return handled;
}
static BOOL continueUserActivity(id delegate, SEL selector, UIApplication *app, NSUserActivity *activity, void (^restoration)(NSArray *)) {
  BOOL handled = ((BOOL (*)(id, SEL, UIApplication *, NSUserActivity *, void (^)(NSArray *)))originalUserActivity)(delegate, selector, app, activity, restoration);
  if ([activity.activityType isEqualToString:NSUserActivityTypeBrowsingWeb] && activity.webpageURL)
    [urlRecipient receivedURL:activity.webpageURL];
  return handled;
}
static NSURL *initialURL(NSDictionary *options) {
  if (options[UIApplicationLaunchOptionsURLKey]) return options[UIApplicationLaunchOptionsURLKey];
  NSDictionary *activity = options[UIApplicationLaunchOptionsUserActivityDictionaryKey];
  return [activity[UIApplicationLaunchOptionsUserActivityTypeKey] isEqual:NSUserActivityTypeBrowsingWeb]
    ? [activity[@"UIApplicationLaunchOptionsUserActivityKey"] webpageURL] : nil;
}

@implementation TNReactComposition {
  NSString *_module;
  NSURL *_bundle;
  UIView *_container;
  NSMutableDictionary *_launchOptions;
  NSMutableArray<NSURL *> *_pendingURLs;
  BOOL _closed;
}
+ (instancetype)installWithModule:(NSString *)module bundle:(NSURL *)bundle {
  NSAssert(NSThread.isMainThread, @"Install retained RN on main, before Tauri starts");
  if (installedComposition) [NSException raise:NSInternalInconsistencyException format:@"Retained RN composition is already installed"];
  if (!bundle.isFileURL || ![NSFileManager.defaultManager fileExistsAtPath:bundle.path])
    [NSException raise:NSInvalidArgumentException format:@"Missing bundled retained RN renderer"];
  TNReactComposition *composition = [self new];
  composition->_module = [module copy]; composition->_bundle = bundle;
  composition->_pendingURLs = [NSMutableArray new];
  installedComposition = composition;
  [NSNotificationCenter.defaultCenter addObserver:composition selector:@selector(launched:) name:UIApplicationDidFinishLaunchingNotification object:nil];
  [NSNotificationCenter.defaultCenter addObserver:composition selector:@selector(terminated:) name:UIApplicationWillTerminateNotification object:nil];
  return composition;
}
- (void)launched:(NSNotification *)notification {
  _launchOptions = [notification.userInfo mutableCopy] ?: [NSMutableDictionary new];
  Class delegate = object_getClass(UIApplication.sharedApplication.delegate);
  Method opened = class_getInstanceMethod(delegate, @selector(application:openURL:options:));
  Method continued = class_getInstanceMethod(delegate, @selector(application:continueUserActivity:restorationHandler:));
  if (![NSStringFromClass(delegate) isEqualToString:@"AppDelegate"] || !opened || !continued)
    [NSException raise:NSInternalInconsistencyException format:@"Retained RN URL forwarding requires the original Tauri AppDelegate"];
  openURLMethod = opened; userActivityMethod = continued;
  originalOpenURL = method_setImplementation(opened, (IMP)openURL);
  originalUserActivity = method_setImplementation(continued, (IMP)continueUserActivity);
  urlRecipient = self;
  [self attachWhenReady];
}
- (void)receivedURL:(NSURL *)url {
  if (_closed) return;
  if (_host) [_host handleOpenURL:url]; else [_pendingURLs addObject:url];
}
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
  if (webviews.count > 1) [NSException raise:NSInternalInconsistencyException format:@"Retained RN composition currently requires one original Tauri WKWebView"];
  WKWebView *webview = webviews.firstObject;
  if (![status[@"status"] isEqual:@"ready"] || !webview || ![self isTauriDocumentReady:webview]) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self attachWhenReady]; }); return;
  }
  if (_pendingURLs.count) {
    NSURL *first = _pendingURLs.firstObject;
    NSURL *initial = initialURL(_launchOptions);
    // UIKit can report the same launch URL in launch options and its first URL callback.
    if (initial && [initial isEqual:first]) [_pendingURLs removeObjectAtIndex:0];
  }
  _container = [self createReactContainer:webview];
  _host = [[TNReactHost alloc] initWithContainer:_container module:_module bundle:_bundle launchOptions:_launchOptions];
  for (NSURL *url in _pendingURLs) [_host handleOpenURL:url];
  [_pendingURLs removeAllObjects];
  [self reactHostDidAttach];
}
- (BOOL)isTauriDocumentReady:(WKWebView *)webview {
  return !webview.loading && webview.estimatedProgress == 1 && webview.URL && ![webview.URL.absoluteString isEqual:@"about:blank"];
}
- (UIView *)createReactContainer:(WKWebView *)webview {
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
- (void)reactHostDidAttach {}
- (void)reload {
  NSAssert(NSThread.isMainThread, @"Reload retained RN on main");
  if (_closed || !_host) [NSException raise:NSInternalInconsistencyException format:@"Retained RN surface is not active"];
  [_host reload];
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close retained RN on main");
  if (_closed) return;
  _closed = YES;
  urlRecipient = nil;
  // Do not overwrite another integration's later wrapper; our inactive wrapper still forwards Tauri.
  if (openURLMethod && method_getImplementation(openURLMethod) == (IMP)openURL)
    method_setImplementation(openURLMethod, originalOpenURL);
  if (userActivityMethod && method_getImplementation(userActivityMethod) == (IMP)continueUserActivity)
    method_setImplementation(userActivityMethod, originalUserActivity);
  [_pendingURLs removeAllObjects];
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [_host close]; _host = nil;
  [_container removeFromSuperview]; _container = nil;
}
@end
