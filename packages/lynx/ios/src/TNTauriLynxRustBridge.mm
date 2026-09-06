#import "TNTauriLynxRustBridge.h"

#import "tauri_native.h"

#include <memory>
#include <cstring>

namespace {

struct RustStringDeleter {
  void operator()(char *value) const
  {
    tauri_native_string_free(value);
  }
};

} // namespace

@implementation TNTauriLynxRustBridge

+ (nullable NSString *)invoke:(NSString *)command
                  payloadJSON:(NSString *)payloadJSON
{
  if (std::strlen(command.UTF8String) != [command lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) {
    return @"{\"abiVersion\":1,\"ok\":false,\"error\":\"Command contains NUL\"}";
  }
#if defined(TAURI_NATIVE_ABI_VERSION)
  if (TAURI_NATIVE_ABI_VERSION != 1 || tauri_native_abi_version() != 1) {
    return @"{\"abiVersion\":1,\"ok\":false,\"error\":{\"code\":\"incompatible_abi\",\"message\":\"Expected tauri-native ABI 1\"}}";
  }
#endif
  std::unique_ptr<char, RustStringDeleter> response(
    tauri_native_invoke(command.UTF8String, payloadJSON.UTF8String)
  );
  if (!response) {
    return nil;
  }

  return [[NSString alloc] initWithUTF8String:response.get()];
}

@end
