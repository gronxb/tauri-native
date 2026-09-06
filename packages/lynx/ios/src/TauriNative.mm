#import "TauriNative.h"

#import "TNTauriLynxRustBridge.h"

@implementation TauriNative {
  NSMutableDictionary<NSString *, NSNumber *> *_sessions;
  BOOL _closed;
}

- (instancetype)init {
  if ((self = [super init])) _sessions = [NSMutableDictionary new];
  return self;
}

+ (NSString *)name
{
  return @"TauriNative";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup
{
  return @{
    @"invoke" : NSStringFromSelector(@selector(invoke:payloadJson:)),
    @"createSession" : NSStringFromSelector(@selector(createSession)),
    @"start" : NSStringFromSelector(@selector(start:id:command:payload:)),
    @"poll" : NSStringFromSelector(@selector(poll:)),
    @"cancel" : NSStringFromSelector(@selector(cancel:id:)),
    @"closeSession" : NSStringFromSelector(@selector(closeSession:)),
  };
}

- (NSString *)invoke:(NSString *)command payloadJson:(NSString *)payloadJson
{
  NSString *response = [TNTauriLynxRustBridge invoke:command payloadJSON:payloadJson];
  return response ?: @"{\"ok\":false,\"error\":{\"code\":\"bridge_error\",\"message\":\"Rust returned no response\"}}";
}

- (NSString *)createSession {
  @synchronized(self) {
    if (_closed) return @"";
    NSNumber *session = @([TNTauriLynxRustBridge createSession]);
    if (session.unsignedLongLongValue == 0) return @"";
    _sessions[session.stringValue] = session;
    return session.stringValue;
  }
}

- (NSString *)start:(NSString *)session id:(NSString *)requestID command:(NSString *)command payload:(NSString *)payload {
  @synchronized(self) {
    NSNumber *handle = _sessions[session];
    return handle ? [TNTauriLynxRustBridge start:handle.unsignedLongLongValue requestID:requestID command:command payloadJSON:payload] : @"{\"error\":\"closed_session\"}";
  }
}

- (NSString *)poll:(NSString *)session {
  @synchronized(self) {
    NSNumber *handle = _sessions[session];
    return handle ? [TNTauriLynxRustBridge poll:handle.unsignedLongLongValue] : @"{\"error\":\"closed_session\"}";
  }
}

- (void)cancel:(NSString *)session id:(NSString *)requestID {
  @synchronized(self) {
    NSNumber *handle = _sessions[session];
    if (handle) [TNTauriLynxRustBridge cancel:handle.unsignedLongLongValue requestID:requestID];
  }
}

- (void)closeSession:(NSString *)session {
  @synchronized(self) {
    NSNumber *handle = _sessions[session];
    [_sessions removeObjectForKey:session];
    if (handle) [TNTauriLynxRustBridge closeSession:handle.unsignedLongLongValue];
  }
}

- (void)destroy {
  @synchronized(self) {
    _closed = YES;
    for (NSNumber *session in _sessions.allValues) [TNTauriLynxRustBridge closeSession:session.unsignedLongLongValue];
    [_sessions removeAllObjects];
  }
}

- (void)dealloc { [self destroy]; }

@end
