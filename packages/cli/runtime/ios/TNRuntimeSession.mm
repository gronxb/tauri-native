#import "TNRuntimeSession.h"
#include "tauri_native_runtime.h"

static NSDictionary *exchange(NSDictionary *operation) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:operation options:0 error:nil];
  NSCAssert(data, @"Native Tauri requests must be JSON serializable");
  NSString *input = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  char *response = tauri_native_runtime_request(input.UTF8String);
  NSData *output = [[NSString stringWithUTF8String:response] dataUsingEncoding:NSUTF8StringEncoding];
  tauri_native_runtime_string_free(response);
  NSDictionary *envelope = [NSJSONSerialization JSONObjectWithData:output options:0 error:nil];
  NSCAssert([envelope[@"abiVersion"] isEqual:@3], @"Retained Tauri runtime requires ABI 3");
  return envelope[@"response"];
}

static NSDictionary *closedError(void) {
  return @{@"ok": @NO, @"code": @"session_closed", @"error": @"Native session is closed"};
}

@implementation TNRuntimeSession {
  NSNumber *_session;
  NSMutableDictionary<NSNumber *, TNRuntimeCompletion> *_pending;
  BOOL _closed;
}

+ (NSDictionary *)status { return exchange(@{@"op": @"status"}); }

- (instancetype)initWithCaller:(NSString *)caller error:(NSError **)error {
  NSAssert(NSThread.isMainThread, @"Use TNRuntimeSession on the main thread");
  if ((self = [super init])) {
    NSDictionary *opened = exchange(@{@"op": @"open", @"caller": caller});
    if (![opened[@"ok"] boolValue]) {
      if (error) *error = [NSError errorWithDomain:@"TauriNativeRuntime" code:1 userInfo:@{NSLocalizedDescriptionKey: [opened description]}];
      return nil;
    }
    _session = opened[@"session"];
    _pending = [NSMutableDictionary new];
  }
  return self;
}

- (NSNumber *)invoke:(NSString *)command payload:(NSDictionary *)payload completion:(TNRuntimeCompletion)completion {
  NSAssert(NSThread.isMainThread, @"Use TNRuntimeSession on the main thread");
  if (_closed) { completion(closedError()); return @0; }
  NSDictionary *submitted = exchange(@{@"op": @"submit", @"session": _session, @"command": command, @"payload": payload});
  if (![submitted[@"ok"] boolValue]) { completion(submitted); return @0; }
  NSNumber *request = submitted[@"request"];
  _pending[request] = [completion copy];
  [self poll:request];
  return request;
}

- (void)poll:(NSNumber *)request {
  if (!_pending[request]) return;
  NSDictionary *response = exchange(@{@"op": @"poll", @"session": _session, @"request": request});
  if ([response[@"ok"] boolValue] && [response[@"status"] isEqual:@"pending"]) {
    __weak TNRuntimeSession *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 16 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{ [weakSelf poll:request]; });
    return;
  }
  TNRuntimeCompletion completion = _pending[request];
  [_pending removeObjectForKey:request];
  completion([response[@"ok"] boolValue] ? response[@"result"] : response);
}

- (void)cancel:(NSNumber *)request {
  NSAssert(NSThread.isMainThread, @"Use TNRuntimeSession on the main thread");
  TNRuntimeCompletion completion = _pending[request];
  if (!completion) return;
  [_pending removeObjectForKey:request];
  exchange(@{@"op": @"cancel", @"session": _session, @"request": request});
  completion(@{@"ok": @NO, @"code": @"request_cancelled", @"error": @"Native request cancelled"});
}

- (void)close {
  if (_closed || !_session) return;
  NSAssert(NSThread.isMainThread, @"Use TNRuntimeSession on the main thread");
  _closed = YES;
  exchange(@{@"op": @"close", @"session": _session});
  NSArray<TNRuntimeCompletion> *callbacks = _pending.allValues;
  [_pending removeAllObjects];
  for (TNRuntimeCompletion completion in callbacks) completion(closedError());
}

- (void)dealloc { [self close]; }
@end
