#import "TNLynxRuntimeModule.h"
#import "TNRuntimeSession.h"

typedef void (^TNReply)(NSDictionary *reply);

static NSDictionary *failure(NSString *code, NSString *message) {
  return @{@"ok": @NO, @"code": code, @"error": message};
}

@interface TNLynxOwnedSession : NSObject
@property(nonatomic) TNRuntimeSession *runtime;
@property(nonatomic) NSMutableDictionary<NSString *, NSNumber *> *pending;
@end
@implementation TNLynxOwnedSession
@end

@interface TNLynxRuntimeScope ()
- (void)exchange:(NSDictionary *)operation reply:(TNReply)reply;
@end

@implementation TNLynxRuntimeScope {
  NSMutableDictionary<NSString *, TNLynxOwnedSession *> *_sessions;
}
- (instancetype)init {
  if ((self = [super init])) _sessions = [NSMutableDictionary new];
  return self;
}
- (void)exchange:(NSDictionary *)operation reply:(TNReply)reply {
  NSString *op = operation[@"op"];
  if ([op isEqual:@"status"]) { reply([TNRuntimeSession status]); return; }
  if ([op isEqual:@"open"]) {
    if (![operation[@"caller"] isKindOfClass:NSString.class]) { reply(failure(@"invalid_request", @"open requires a caller")); return; }
    NSError *error;
    TNRuntimeSession *runtime = [[TNRuntimeSession alloc] initWithCaller:operation[@"caller"] error:&error];
    if (!runtime) { reply(failure(@"runtime_error", error.localizedDescription)); return; }
    TNLynxOwnedSession *session = [TNLynxOwnedSession new];
    session.runtime = runtime; session.pending = [NSMutableDictionary new];
    NSString *key = NSUUID.UUID.UUIDString;
    _sessions[key] = session;
    reply(@{@"ok": @YES, @"session": key}); return;
  }
  NSString *key = operation[@"session"];
  if (![key isKindOfClass:NSString.class]) { reply(failure(@"invalid_request", @"Operation requires a session")); return; }
  TNLynxOwnedSession *session = _sessions[key];
  if ([op isEqual:@"close"]) {
    [_sessions removeObjectForKey:key]; [session.runtime close];
    reply(@{@"ok": @YES}); return;
  }
  if (!session) { reply(failure(@"session_closed", @"Native session is closed")); return; }
  if ([op isEqual:@"invoke"] || [op isEqual:@"listen"]) {
    NSString *requestID = operation[@"id"];
    BOOL invoke = [op isEqual:@"invoke"];
    if (![requestID isKindOfClass:NSString.class] ||
        (invoke ? ![operation[@"command"] isKindOfClass:NSString.class] || ![operation[@"payload"] isKindOfClass:NSDictionary.class]
                : ![operation[@"event"] isKindOfClass:NSString.class])) {
      reply(failure(@"invalid_request", @"Invalid invoke/listen arguments")); return;
    }
    if (session.pending[requestID]) { reply(failure(@"duplicate_request", @"Request ID is already pending")); return; }
    TNRuntimeCompletion complete = ^(NSDictionary *result) { [session.pending removeObjectForKey:requestID]; reply(result); };
    NSNumber *request = invoke ? [session.runtime invoke:operation[@"command"] payload:operation[@"payload"] completion:complete]
      : [session.runtime listen:operation[@"event"] completion:complete];
    if (request.unsignedLongLongValue != 0) session.pending[requestID] = request;
  } else if ([op isEqual:@"events"]) {
    [session.runtime pollEvents:reply];
  } else if ([op isEqual:@"unlisten"] && [operation[@"subscription"] isKindOfClass:NSNumber.class]) {
    reply(@{@"ok": @YES, @"removed": @([session.runtime unlisten:operation[@"subscription"]])});
  } else if ([op isEqual:@"cancel"] && [operation[@"id"] isKindOfClass:NSString.class]) {
    NSNumber *request = session.pending[operation[@"id"]];
    [session.pending removeObjectForKey:operation[@"id"]];
    if (request) [session.runtime cancel:request];
    reply(@{@"ok": @YES});
  } else {
    reply(failure(@"invalid_request", @"Unknown operation or missing argument"));
  }
}
- (void)close {
  NSAssert(NSThread.isMainThread, @"Close the Lynx runtime scope on main");
  if (_closed) return;
  _closed = YES;
  for (TNLynxOwnedSession *session in _sessions.allValues) [session.runtime close];
  [_sessions removeAllObjects];
}
@end

@implementation TNLynxRuntimeModule {
  TNLynxRuntimeScope *_scope;
}
+ (NSString *)name { return @"TauriNativeRuntime"; }
+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{@"exchange": NSStringFromSelector(@selector(exchange:callback:))};
}
- (instancetype)initWithParam:(id)param {
  NSParameterAssert([param isKindOfClass:TNLynxRuntimeScope.class]);
  if ((self = [super init])) _scope = param;
  return self;
}
- (void)exchange:(NSString *)json callback:(LynxCallbackBlock)callback {
  TNLynxRuntimeScope *scope = _scope;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (scope.closed) return;
    TNReply reply = ^(NSDictionary *value) {
      if (scope.closed) return;
      NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
      callback([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
    };
    id operation = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    if (![operation isKindOfClass:NSDictionary.class]) { reply(failure(@"invalid_request", @"Operation must be a JSON object")); return; }
    [scope exchange:operation reply:reply];
  });
}
- (void)destroy {
  TNLynxRuntimeScope *scope = _scope;
  dispatch_async(dispatch_get_main_queue(), ^{ [scope close]; });
}
- (void)dealloc { [self destroy]; }
@end
