#include <cstring>
#import "TNReactHost.h"
#import "TNReactRuntimeModule.h"
#import "TNReactTauriView.h"
#import <React/RCTLinkingManager.h>
#import <React/RCTSurfaceHostingProxyRootView.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

// Each engine owns its Linking delivery; retiring it cannot notify its successor.
@interface TNReactLinkingManager : RCTLinkingManager
- (void)receiveURL:(NSURL *)url;
- (void)retire;
@end
@implementation TNReactLinkingManager {
  NSMutableArray<NSURL *> *_pendingURLs;
  BOOL _observing, _observed, _retired;
}
+ (NSString *)moduleName { return @"LinkingManager"; }
+ (BOOL)requiresMainQueueSetup { return YES; }
- (instancetype)init {
  if ((self = [super init])) _pendingURLs = [NSMutableArray new];
  return self;
}
- (void)receiveURL:(NSURL *)url {
  if (_retired) return;
  if (_observing) [self sendEventWithName:@"url" body:@{@"url": url.absoluteString}];
  else if (!_observed) [_pendingURLs addObject:url];
}
- (void)startObserving {
  if (_retired) return;
  _observing = YES; _observed = YES;
  NSArray<NSURL *> *pending = [_pendingURLs copy]; [_pendingURLs removeAllObjects];
  for (NSURL *url in pending) [self receiveURL:url];
}
- (void)stopObserving { _observing = NO; }
- (void)retire { _retired = YES; _observing = NO; [_pendingURLs removeAllObjects]; }
@end

@interface TNReactFactoryDelegate : RCTDefaultReactNativeFactoryDelegate
@property(nonatomic) NSURL *url;
@property(nonatomic) TNReactLinkingManager *linking;
- (void)retire;
@end
@implementation TNReactFactoryDelegate {
  NSHashTable<TNReactRuntimeModule *> *_modules;
  BOOL _retired;
}
- (instancetype)init {
  if ((self = [super init])) {
    _modules = [NSHashTable weakObjectsHashTable];
    self.linking = [TNReactLinkingManager new];
    self.dependencyProvider = [RCTAppDependencyProvider new];
  }
  return self;
}
- (NSURL *)bundleURL { return self.url; }
- (NSDictionary<NSString *, Class<RCTComponentViewProtocol>> *)thirdPartyFabricComponents {
  NSMutableDictionary *components = [[super thirdPartyFabricComponents] mutableCopy];
  components[@"TauriRetainedView"] = TNReactTauriView.class;
  return components;
}
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge { return self.url; }
- (Class)getModuleClassFromName:(const char *)name {
  if (strcmp(name, "LinkingManager") == 0) return TNReactLinkingManager.class;
  return strcmp(name, "TauriNativeRuntime") == 0 ? TNReactRuntimeModule.class : [super getModuleClassFromName:name];
}
- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass {
  if (moduleClass == TNReactLinkingManager.class) return (id<RCTTurboModule>)self.linking;
  if (moduleClass != TNReactRuntimeModule.class) return [super getModuleInstanceFromClass:moduleClass];
  @synchronized(self) {
    TNReactRuntimeModule *module = [TNReactRuntimeModule new];
    if (_retired) [module retire]; else [_modules addObject:module];
    return module;
  }
}
- (void)retire {
  NSAssert(NSThread.isMainThread, @"Retire the RN factory on main");
  @synchronized(self) {
    _retired = YES;
    [self.linking retire];
    for (TNReactRuntimeModule *module in _modules.allObjects) [module retire];
    [_modules removeAllObjects];
  }
}
@end

@implementation TNReactHost {
  UIView *_container;
  WKWebView *_webView;
  TNReactViewScope *_viewScope;
  NSString *_module;
  NSURL *_bundle;
  NSDictionary *_launchOptions;
  RCTSurfaceHostingProxyRootView *_surface;
  RCTReactNativeFactory *_factory;
  TNReactFactoryDelegate *_delegate;
  BOOL _closed;
}
- (instancetype)initWithContainer:(UIView *)container module:(NSString *)module bundle:(NSURL *)bundle {
  return [self initWithContainer:container module:module bundle:bundle launchOptions:nil];
}
- (instancetype)initWithContainer:(UIView *)container module:(NSString *)module bundle:(NSURL *)bundle launchOptions:(NSDictionary *)launchOptions {
  return [self initWithContainer:container webView:nil module:module bundle:bundle launchOptions:launchOptions];
}
- (instancetype)initWithContainer:(UIView *)container webView:(WKWebView *)webView module:(NSString *)module bundle:(NSURL *)bundle launchOptions:(NSDictionary *)launchOptions {
  NSAssert(NSThread.isMainThread, @"Use TNReactHost on main");
  if ((self = [super init])) {
    _container = container; _module = [module copy]; _bundle = bundle;
    _webView = webView;
    _launchOptions = [launchOptions copy];
    [self reload];
  }
  return self;
}
- (void)reload {
  NSAssert(NSThread.isMainThread, @"Reload the RN host on main");
  if (_closed) [NSException raise:NSInternalInconsistencyException format:@"RN host is closed"];
  [self releaseSurface];
  _delegate = [TNReactFactoryDelegate new]; _delegate.url = _bundle;
  _factory = [[RCTReactNativeFactory alloc] initWithDelegate:_delegate];
  UIView *view = [_factory.rootViewFactory viewWithModuleName:_module initialProperties:nil launchOptions:_launchOptions];
  if (![view isKindOfClass:RCTSurfaceHostingProxyRootView.class])
    [NSException raise:NSInternalInconsistencyException format:@"Retained Tauri requires a Fabric surface"];
  _surface = (RCTSurfaceHostingProxyRootView *)view;
  _viewScope = [[TNReactViewScope alloc] initWithWebView:_webView];
  [_viewScope bindToSurface:_surface];
  _surface.frame = _container.bounds;
  _surface.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [_container addSubview:_surface];
}
- (void)handleOpenURL:(NSURL *)url {
  NSAssert(NSThread.isMainThread, @"Forward RN URLs on main");
  if (!_closed) [_delegate.linking receiveURL:url];
}
- (void)releaseSurface {
  // Close sessions before RN invalidates its modules/JSI, without blocking the UI thread.
  [_delegate retire];
  [_viewScope close]; _viewScope = nil;
  [_surface removeFromSuperview]; [_surface.surface stop]; _surface = nil;
  // RCTHost 0.86 releases its RCTInstance asynchronously from dealloc.
  _factory.rootViewFactory.reactHost = nil;
  _factory = nil; _delegate = nil;
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close TNReactHost on main");
  if (_closed) return;
  _closed = YES;
  [self releaseSurface];
}
- (void)dealloc { [self close]; }
@end
