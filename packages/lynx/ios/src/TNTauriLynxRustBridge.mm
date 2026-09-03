#import "TNTauriLynxRustBridge.h"

#import "tauri_native.h"

#include <memory>

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
  std::unique_ptr<char, RustStringDeleter> response(
    tauri_native_invoke(command.UTF8String, payloadJSON.UTF8String)
  );
  if (!response) {
    return nil;
  }

  return [[NSString alloc] initWithUTF8String:response.get()];
}

@end
