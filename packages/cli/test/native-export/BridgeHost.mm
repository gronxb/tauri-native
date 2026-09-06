#import <Foundation/Foundation.h>
#import "TNTauriRustBridge.h"
#import "TNTauriLynxRustBridge.h"

static NSDictionary *invoke(Class bridge, NSString *command, NSString *payload) {
  NSString *response = [bridge invoke:command payloadJSON:payload];
  NSCAssert(response != nil, @"The native bridge must return a response");
  return [NSJSONSerialization JSONObjectWithData:[response dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
}

int main(int argc, const char **argv) {
  @autoreleasepool {
    for (Class bridge in @[[TNTauriRustBridge class], [TNTauriLynxRustBridge class]]) {
      if (argc > 1) {
        NSDictionary *response = invoke(bridge, @"greet", @"{}");
        NSCAssert([response[@"error"][@"code"] isEqual:@"incompatible_abi"], @"Reject the incompatible library before invoking it");
        continue;
      }
      NSDictionary *success = invoke(bridge, @"greet", @"{\"displayName\":\"한글 🦀\"}");
      NSCAssert([success[@"value"] isEqual:@"Hello, 한글 🦀!"], @"Preserve UTF-8 through the actual package bridge");
      NSDictionary *failure = invoke(bridge, @"greet", @"{}");
      NSCAssert([failure[@"ok"] isEqual:@NO], @"Preserve command errors");
      const unichar characters[] = {'g', 'r', 'e', 'e', 't', 0, 'x'};
      NSString *command = [NSString stringWithCharacters:characters length:7];
      NSDictionary *nul = invoke(bridge, command, @"{\"displayName\":\"Ada\"}");
      NSCAssert([nul[@"error"] isEqual:@"Command contains NUL"], @"Never invoke a truncated command name");
    }
    puts("PASS: React Native and Lynx Objective-C++ ABI consumers");
  }
}
