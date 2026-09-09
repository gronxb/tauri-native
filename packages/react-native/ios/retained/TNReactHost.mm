#include <cstring>
#import "TNReactHost.h"
#import "TNReactRuntimeModule.h"
#import <React/RCTSurfaceHostingProxyRootView.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@interface TNReactFactoryDelegate : RCTDefaultReactNativeFactoryDelegate
@property(nonatomic) NSURL *url;
- (void)retire;
@end
@implementation TNReactFactoryDelegate {
  NSHashTable<TNReactRuntimeModule *> *_modules;
  BOOL _retired;
}
- (instancetype)init {
  if ((self = [super init])) {
    _modules = [NSHashTable weakObjectsHashTable];
    self.dependencyProvider = [RCTAppDependencyProvider new];
  }
  return self;
}
- (NSURL *)bundleURL { return self.url; }
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge { return self.url; }
- (Class)getModuleClassFromName:(const char *)name {
  return strcmp(name, "TauriNativeRuntime") == 0 ? TNReactRuntimeModule.class : [super getModuleClassFromName:name];
}
- (id<RCTTurboModule>)getModuleInstanceFromClass:(Class)moduleClass {
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
    for (TNReactRuntimeModule *module in _modules.allObjects) [module retire];
    [_modules removeAllObjects];
  }
}
@end

@implementation TNReactHost {
  UIView *_container;
  NSString *_module;
  NSURL *_bundle;
  RCTSurfaceHostingProxyRootView *_surface;
  RCTReactNativeFactory *_factory;
  TNReactFactoryDelegate *_delegate;
  BOOL _closed;
}
- (instancetype)initWithContainer:(UIView *)container module:(NSString *)module bundle:(NSURL *)bundle {
  NSAssert(NSThread.isMainThread, @"Use TNReactHost on main");
  if ((self = [super init])) {
    _container = container; _module = [module copy]; _bundle = bundle;
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
  UIView *view = [_factory.rootViewFactory viewWithModuleName:_module initialProperties:nil launchOptions:nil];
  if (![view isKindOfClass:RCTSurfaceHostingProxyRootView.class])
    [NSException raise:NSInternalInconsistencyException format:@"Retained Tauri requires a Fabric surface"];
  _surface = (RCTSurfaceHostingProxyRootView *)view;
  _surface.frame = _container.bounds;
  _surface.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [_container addSubview:_surface];
}
- (void)releaseSurface {
  // Close sessions before RN invalidates its modules/JSI, without blocking the UI thread.
  [_delegate retire];
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
