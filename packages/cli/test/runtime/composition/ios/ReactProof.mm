#import "ReactProof.h"
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTSurfaceHostingProxyRootView.h>
#import <React_RCTAppDelegate/RCTDefaultReactNativeFactoryDelegate.h>
#import <React_RCTAppDelegate/RCTReactNativeFactory.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

typedef void (^ProofCallback)(NSString *);

@interface ProofFactoryDelegate : RCTDefaultReactNativeFactoryDelegate
@end
@implementation ProofFactoryDelegate
- (NSURL *)bundleURL { return [NSBundle.mainBundle URLForResource:@"index.bundle" withExtension:@"js" subdirectory:@"assets"]; }
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge { return [self bundleURL]; }
@end

// Test-only attachment. Tauri still owns UIApplication and the original WKWebView.
@interface ReactProof () <WKScriptMessageHandler>
@property(nonatomic) WKWebView *webview;
@property(nonatomic) RCTSurfaceHostingProxyRootView *surface;
@property(nonatomic) RCTReactNativeFactory *factory;
@property(nonatomic) ProofFactoryDelegate *factoryDelegate;
@property(nonatomic) NSMutableDictionary *report;
@property(nonatomic) NSMutableDictionary<NSNumber *, ProofCallback> *pending;
@property(nonatomic) NSString *directory;
@property(nonatomic) NSString *script;
@property(nonatomic) NSInteger generation, released, resumed, paused, stopped, sequence, completed;
- (void)inspect:(ProofCallback)callback;
- (void)mount;
@end

static ReactProof *active;

@interface ReactProofModule : NSObject <RCTBridgeModule>
@end
@implementation ReactProofModule
RCT_EXPORT_MODULE(RuntimeProof)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }
RCT_EXPORT_METHOD(inspect:(RCTResponseSenderBlock)callback) { [active inspect:^(NSString *json) { callback(@[json]); }]; }
RCT_EXPORT_METHOD(remount) { [active mount]; }
@end

@implementation ReactProof
+ (void)install {
  active = [ReactProof new];
  active.report = [NSMutableDictionary new];
  active.pending = [NSMutableDictionary new];
  active.directory = [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject
    stringByAppendingPathComponent:NSBundle.mainBundle.bundleIdentifier];
  NSString *asset = [NSBundle.mainBundle pathForResource:@"composition-probe" ofType:@"js" inDirectory:@"assets"];
  active.script = [NSString stringWithContentsOfFile:asset encoding:NSUTF8StringEncoding error:nil];
  NSAssert(active.script, @"Missing composition probe");
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:active selector:@selector(launched:) name:UIApplicationDidFinishLaunchingNotification object:nil];
  [center addObserver:active selector:@selector(resumed:) name:UIApplicationDidBecomeActiveNotification object:nil];
  [center addObserver:active selector:@selector(paused:) name:UIApplicationWillResignActiveNotification object:nil];
  [center addObserver:active selector:@selector(stopped:) name:UIApplicationDidEnterBackgroundNotification object:nil];
}

- (void)persist {
  [self.report addEntriesFromDictionary:@{@"generation": @(self.generation), @"released": @(self.released),
    @"resumed": @(self.resumed), @"paused": @(self.paused), @"stopped": @(self.stopped), @"completed": @(self.completed),
    @"pid": @(NSProcessInfo.processInfo.processIdentifier),
    @"appDelegate": NSStringFromClass(UIApplication.sharedApplication.delegate.class)}];
  [NSFileManager.defaultManager createDirectoryAtPath:self.directory withIntermediateDirectories:YES attributes:nil error:nil];
  NSData *data = [NSJSONSerialization dataWithJSONObject:self.report options:0 error:nil];
  NSAssert([data writeToFile:[self.directory stringByAppendingPathComponent:@"composition-report.json"] atomically:YES], @"Cannot write report");
}

- (void)resumed:(NSNotification *)notification { self.resumed++; [self persist]; }
- (void)paused:(NSNotification *)notification { self.paused++; [self persist]; }
- (void)stopped:(NSNotification *)notification { self.stopped++; [self persist]; }
- (void)launched:(NSNotification *)notification { [self attachWhenReady]; }

- (WKWebView *)findWebview:(UIView *)view {
  if ([view isKindOfClass:WKWebView.class]) return (WKWebView *)view;
  for (UIView *child in view.subviews) {
    WKWebView *found = [self findWebview:child];
    if (found) return found;
  }
  return nil;
}

- (void)attachWhenReady {
  for (UIWindow *window in UIApplication.sharedApplication.windows) {
    self.webview = [self findWebview:window];
    if (self.webview) break;
  }
  if (!self.webview || ![NSFileManager.defaultManager fileExistsAtPath:[self.directory stringByAppendingPathComponent:@"runtime-report.json"]]) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [self attachWhenReady]; });
    return;
  }
  [self.webview.configuration.userContentController addScriptMessageHandler:self name:@"RuntimeProofResult"];
  [self mount];
}

- (void)mount {
  if (self.surface) {
    [self.surface removeFromSuperview];
    [self.surface.surface stop];
    self.surface = nil;
    self.released++;
    [self.pending removeAllObjects];
  }
  self.generation++;
  [self persist];
  UIView *parent = self.webview.superview;
  CGRect bounds = parent.bounds;
  CGRect frame = CGRectMake(0, bounds.size.height / 2, bounds.size.width, bounds.size.height / 2);
  if (!self.factory) {
    self.factoryDelegate = [ProofFactoryDelegate new];
    self.factoryDelegate.dependencyProvider = [RCTAppDependencyProvider new];
    self.factory = [[RCTReactNativeFactory alloc] initWithDelegate:self.factoryDelegate];
  }
  UIView *view = [self.factory.rootViewFactory viewWithModuleName:@"RuntimeProof" initialProperties:nil launchOptions:nil];
  NSAssert([view isKindOfClass:RCTSurfaceHostingProxyRootView.class], @"Expected a real Fabric surface");
  self.surface = (RCTSurfaceHostingProxyRootView *)view;
  self.surface.frame = frame;
  self.surface.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight | UIViewAutoresizingFlexibleTopMargin;
  [parent addSubview:self.surface];
}

- (void)inspect:(ProofCallback)callback {
  NSNumber *request = @(++self.sequence);
  self.pending[request] = [callback copy];
  [self.webview evaluateJavaScript:[NSString stringWithFormat:@"(%@)(%@)", self.script, request] completionHandler:nil];
}

- (void)userContentController:(WKUserContentController *)controller didReceiveScriptMessage:(WKScriptMessage *)message {
  if (!message.frameInfo.isMainFrame || message.webView != self.webview) return;
  NSMutableDictionary *value = [NSJSONSerialization JSONObjectWithData:[message.body dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingMutableContainers error:nil];
  ProofCallback callback = self.pending[value[@"id"]];
  if (!callback) return;
  [self.pending removeObjectForKey:value[@"id"]];
  value[@"generation"] = @(self.generation);
  self.report[@"lastProbe"] = value;
  self.completed++;
  [self persist];
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  callback([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
}
@end
