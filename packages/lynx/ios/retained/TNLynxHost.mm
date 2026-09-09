#import "TNLynxHost.h"
#import "TNLynxRuntimeModule.h"
#import <Lynx/LynxConfig.h>
#import <Lynx/LynxView.h>
#import <Lynx/LynxViewBuilder.h>

@implementation TNLynxHost {
  UIView *_container;
  NSData *_bundle;
  NSString *_url;
  LynxView *_view;
  TNLynxRuntimeScope *_scope;
  BOOL _closed;
}
- (instancetype)initWithContainer:(UIView *)container bundle:(NSData *)bundle url:(NSString *)url {
  NSAssert(NSThread.isMainThread, @"Use TNLynxHost on main");
  if ((self = [super init])) {
    _container = container; _bundle = bundle; _url = [url copy];
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
  LynxConfig *config = [[LynxConfig alloc] initWithProvider:nil];
  [config registerModule:TNLynxRuntimeModule.class param:_scope];
  CGSize size = _container.bounds.size;
  _view = [[LynxView alloc] initWithBuilderBlock:^(LynxViewBuilder *builder) {
    builder.config = config; builder.screenSize = size; builder.fontScale = 1.0;
  }];
  _view.frame = _container.bounds;
  _view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
  [_container addSubview:_view];
  [_view loadTemplate:_bundle withURL:_url];
  if (UIApplication.sharedApplication.applicationState == UIApplicationStateActive) [_view onEnterForeground];
}
- (void)resumed:(NSNotification *)notification { [_view onEnterForeground]; }
- (void)paused:(NSNotification *)notification { [_view onEnterBackground]; }
- (void)releaseSurface {
  // Close native requests/listeners before the JS engine can be replaced.
  [_scope close]; _scope = nil;
  [_view removeFromSuperview]; [_view clearForDestroy]; _view = nil;
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close TNLynxHost on main");
  if (_closed) return;
  _closed = YES;
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [self releaseSurface];
}
- (void)dealloc { [self close]; }
@end
