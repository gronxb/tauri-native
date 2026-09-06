#import <Foundation/Foundation.h>
#import "TNTauriRustBridge.h"
#import "TNTauriLynxRustBridge.h"

static id json(NSString *value) {
  return [NSJSONSerialization JSONObjectWithData:[value dataUsingEncoding:NSUTF8StringEncoding] options:NSJSONReadingFragmentsAllowed error:nil];
}

static NSArray *drain(Class bridge, uint64_t session, NSUInteger count) {
  NSMutableArray *responses = [NSMutableArray new];
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
  while (responses.count < count && deadline.timeIntervalSinceNow > 0) {
    id batch = json([bridge poll:session]);
    NSCAssert([batch isKindOfClass:NSArray.class], @"Polling returns a batch");
    [responses addObjectsFromArray:batch];
    [NSThread sleepForTimeInterval:0.002];
  }
  NSCAssert(responses.count == count, @"Every accepted request completes exactly once");
  return responses;
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    NSCAssert(argc == 3, @"Expected request and output paths");
    NSArray *requests = json([NSString stringWithContentsOfFile:@(argv[1]) encoding:NSUTF8StringEncoding error:nil]);
    NSMutableDictionary *results = [NSMutableDictionary new];
    for (Class bridge in @[[TNTauriRustBridge class], [TNTauriLynxRustBridge class]]) {
      uint64_t session = [bridge createSession];
      NSCAssert(session != 0, @"ABI 2 sessions must be available");
      NSCAssert([[bridge start:session requestID:@"slow" command:@"held" payloadJSON:@"{\"label\":\"slow\"}"] isEqual:@""], @"Accept held work");
      NSCAssert([[bridge start:session requestID:@"fast" command:@"delayed" payloadJSON:@"{\"label\":\"fast\",\"milliseconds\":1}"] isEqual:@""], @"Accept awaited work");
      NSArray *ordered = drain(bridge, session, 1);
      NSCAssert([ordered[0][@"id"] isEqual:@"fast"], @"Fast work finishes while the first request is held");
      NSCAssert([json([bridge invoke:@"release" payloadJSON:@"{\"label\":\"slow\"}"])[@"ok"] isEqual:@YES], @"Release held work");
      NSCAssert([drain(bridge, session, 1)[0][@"id"] isEqual:@"slow"], @"Route the later response correctly");
      NSMutableArray *parity = [NSMutableArray new];
      for (NSDictionary *request in requests) {
        NSString *payload = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:request[@"payload"] options:0 error:nil] encoding:NSUTF8StringEncoding];
        NSCAssert([[bridge start:session requestID:@"parity" command:request[@"command"] payloadJSON:payload] isEqual:@""], @"Accept parity request");
        NSMutableDictionary *response = [json(drain(bridge, session, 1)[0][@"response"]) mutableCopy];
        NSCAssert([response[@"abiVersion"] isEqual:@2], @"Version every async response");
        [response removeObjectForKey:@"abiVersion"];
        [parity addObject:response];
      }
      [bridge closeSession:session];
      NSCAssert([json([bridge poll:session])[@"error"] isEqual:@"closed_session"], @"Closed sessions cannot deliver results");
      results[NSStringFromClass(bridge)] = parity;
    }
    [[NSJSONSerialization dataWithJSONObject:results options:0 error:nil] writeToFile:@(argv[2]) atomically:YES];
    puts("PASS: awaited and blocking commands through both Objective-C++ session bridges");
  }
}
