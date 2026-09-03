#import "TauriNative.h"

#import "TNTauriLynxRustBridge.h"

@implementation TauriNative

+ (NSString *)name
{
  return @"TauriNative";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup
{
  return @{
    @"invoke" : NSStringFromSelector(@selector(invoke:payloadJson:)),
  };
}

- (NSString *)invoke:(NSString *)command payloadJson:(NSString *)payloadJson
{
  NSString *response = [TNTauriLynxRustBridge invoke:command payloadJSON:payloadJson];
  return response ?: @"{\"ok\":false,\"error\":{\"code\":\"bridge_error\",\"message\":\"Rust returned no response\"}}";
}

@end
