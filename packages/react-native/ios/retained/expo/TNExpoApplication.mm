#import "TNExpoApplication.h"
#import <UIKit/UIKit.h>
#import <objc/runtime.h>
#if __has_include(<Expo/Expo-Swift.h>)
#import <Expo/Expo-Swift.h>
#else
#import "Expo-Swift.h"
#endif

// Application subscribers live for the application, independently of each RN engine.
static id<UIApplicationDelegate> expoDelegate;
static __weak id tauriDelegate;
static IMP originalSetDelegate, originalResponds, originalSignature, originalForward;
static NSMutableDictionary<NSString *, NSValue *> *originalCallbacks;

static BOOL expoCallback(SEL selector) {
  return protocol_getMethodDescription(@protocol(UIApplicationDelegate), selector, NO, YES).name &&
    [expoDelegate respondsToSelector:selector];
}
static IMP original(SEL selector) { return (IMP)originalCallbacks[NSStringFromSelector(selector)].pointerValue; }
static void saveMethod(Class owner, SEL selector, IMP replacement) {
  Method method = class_getInstanceMethod(owner, selector);
  NSCAssert(method, @"Expected original Tauri method %@", NSStringFromSelector(selector));
  originalCallbacks[NSStringFromSelector(selector)] = [NSValue valueWithPointer:(const void *)method_getImplementation(method)];
  // Never replace an inherited NSObject implementation on NSObject itself.
  class_replaceMethod(owner, selector, replacement, method_getTypeEncoding(method));
}
static BOOL responds(id self, SEL cmd, SEL selector) {
  return ((BOOL (*)(id, SEL, SEL))originalResponds)(self, cmd, selector) || (self == tauriDelegate && expoCallback(selector));
}
static NSMethodSignature *signature(id self, SEL cmd, SEL selector) {
  NSMethodSignature *result = ((NSMethodSignature *(*)(id, SEL, SEL))originalSignature)(self, cmd, selector);
  return result ?: (self == tauriDelegate && expoCallback(selector) ? [(NSObject *)expoDelegate methodSignatureForSelector:selector] : nil);
}
static void forward(id self, SEL cmd, NSInvocation *invocation) {
  if (self == tauriDelegate && expoCallback(invocation.selector)) [invocation invokeWithTarget:expoDelegate];
  else ((void (*)(id, SEL, NSInvocation *))originalForward)(self, cmd, invocation);
}
static BOOL launched(id self, SEL cmd, UIApplication *app, NSDictionary *options) {
  BOOL tauri = ((BOOL (*)(id, SEL, UIApplication *, NSDictionary *))original(cmd))(self, cmd, app, options);
  BOOL expo = [expoDelegate application:app didFinishLaunchingWithOptions:options];
  return tauri && expo;
}
static BOOL opened(id self, SEL cmd, UIApplication *app, NSURL *url, NSDictionary *options) {
  BOOL tauri = ((BOOL (*)(id, SEL, UIApplication *, NSURL *, NSDictionary *))original(cmd))(self, cmd, app, url, options);
  BOOL expo = [expoDelegate application:app openURL:url options:options];
  return tauri || expo;
}
static BOOL continued(id self, SEL cmd, UIApplication *app, NSUserActivity *activity, void (^restoration)(NSArray *)) {
  BOOL tauri = ((BOOL (*)(id, SEL, UIApplication *, NSUserActivity *, void (^)(NSArray *)))original(cmd))(self, cmd, app, activity, restoration);
  BOOL expo = [expoDelegate application:app continueUserActivity:activity restorationHandler:restoration];
  return tauri || expo;
}
static void lifecycle(id self, SEL cmd, UIApplication *app) {
  ((void (*)(id, SEL, UIApplication *))original(cmd))(self, cmd, app);
  ((void (*)(id, SEL, UIApplication *))[(NSObject *)expoDelegate methodForSelector:cmd])(expoDelegate, cmd, app);
}
static void setDelegate(UIApplication *app, SEL cmd, id delegate) {
  if (!delegate) { ((void (*)(id, SEL, id))originalSetDelegate)(app, cmd, delegate); return; }
  Class owner = object_getClass(delegate);
  if (![NSStringFromClass(owner) isEqualToString:@"AppDelegate"])
    [NSException raise:NSInternalInconsistencyException format:@"Retained Expo requires the original Tauri AppDelegate"];
  tauriDelegate = delegate;
  expoDelegate = [EXExpoAppDelegate new];
  originalCallbacks = [NSMutableDictionary new];
  NSDictionary<NSString *, NSValue *> *overlap = @{
    @"application:didFinishLaunchingWithOptions:": [NSValue valueWithPointer:(const void *)launched],
    @"application:openURL:options:": [NSValue valueWithPointer:(const void *)opened],
    @"application:continueUserActivity:restorationHandler:": [NSValue valueWithPointer:(const void *)continued],
    @"applicationWillResignActive:": [NSValue valueWithPointer:(const void *)lifecycle],
    @"applicationWillEnterForeground:": [NSValue valueWithPointer:(const void *)lifecycle],
    @"applicationDidEnterBackground:": [NSValue valueWithPointer:(const void *)lifecycle],
    @"applicationWillTerminate:": [NSValue valueWithPointer:(const void *)lifecycle],
  };
  // Unknown overlapping callbacks need an explicit result/completion ownership contract.
  unsigned int count = 0;
  struct objc_method_description *methods = protocol_copyMethodDescriptionList(@protocol(UIApplicationDelegate), NO, YES, &count);
  for (unsigned int i = 0; i < count; i++) {
    SEL selector = methods[i].name;
    if (expoCallback(selector) && [delegate respondsToSelector:selector] && !overlap[NSStringFromSelector(selector)])
      [NSException raise:NSInternalInconsistencyException format:@"Retained Expo requires explicit routing for existing callback %@", NSStringFromSelector(selector)];
  }
  free(methods);
  for (NSString *name in overlap) {
    SEL selector = NSSelectorFromString(name);
    if (class_getInstanceMethod(owner, selector)) saveMethod(owner, selector, (IMP)overlap[name].pointerValue);
  }
  saveMethod(owner, @selector(respondsToSelector:), (IMP)responds); originalResponds = original(@selector(respondsToSelector:));
  saveMethod(owner, @selector(methodSignatureForSelector:), (IMP)signature); originalSignature = original(@selector(methodSignatureForSelector:));
  saveMethod(owner, @selector(forwardInvocation:), (IMP)forward); originalForward = original(@selector(forwardInvocation:));
  // UIKit caches optional callback availability in this setter, after routing is installed.
  method_setImplementation(class_getInstanceMethod(UIApplication.class, cmd), originalSetDelegate);
  ((void (*)(id, SEL, id))originalSetDelegate)(app, cmd, delegate);
}

void TNInstallExpoApplication(void) {
  NSCAssert(NSThread.isMainThread && !originalSetDelegate, @"Install retained Expo once before Tauri starts");
  Method setter = class_getInstanceMethod(UIApplication.class, @selector(setDelegate:));
  originalSetDelegate = method_setImplementation(setter, (IMP)setDelegate);
  [NSNotificationCenter.defaultCenter addObserverForName:UIApplicationDidFinishLaunchingNotification object:nil queue:nil usingBlock:^(NSNotification *notification) {
    NSCAssert(tauriDelegate && UIApplication.sharedApplication.delegate == tauriDelegate, @"Expo callback routing did not retain the original Tauri delegate");
  }];
}
