#import "__TAURI_NATIVE_OBJC_BRIDGE__.h"

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

@implementation __TAURI_NATIVE_OBJC_BRIDGE__

+ (NSString *)appDataDirectory {
  NSURL *root = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject;
  return [[root URLByAppendingPathComponent:@"tauri-native" isDirectory:YES].path stringByAppendingString:@"/"];
}

+ (nullable NSString *)invoke:(NSString *)command
                  payloadJSON:(NSString *)payloadJSON
{
  if (std::strlen(command.UTF8String) != [command lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) {
    return @"{\"abiVersion\":1,\"ok\":false,\"error\":\"Command contains NUL\"}";
  }
#if defined(TAURI_NATIVE_ABI_VERSION)
  if ((TAURI_NATIVE_ABI_VERSION != 1 && TAURI_NATIVE_ABI_VERSION != 2) || tauri_native_abi_version() != TAURI_NATIVE_ABI_VERSION) {
    return @"{\"abiVersion\":1,\"ok\":false,\"error\":{\"code\":\"incompatible_abi\",\"message\":\"Incompatible tauri-native ABI\"}}";
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

+ (uint64_t)createSession {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  if (tauri_native_abi_version() == 2) return tauri_native_session_create();
#endif
  return 0;
}

+ (NSString *)start:(uint64_t)session requestID:(NSString *)requestID command:(NSString *)command payloadJSON:(NSString *)payload {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  for (NSString *value in @[requestID, command, payload]) {
    if (std::strlen(value.UTF8String) != [value lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) return @"{\"error\":\"invalid_argument\"}";
  }
  std::unique_ptr<char, RustStringDeleter> response(tauri_native_session_start(session, requestID.UTF8String, command.UTF8String, payload.UTF8String));
  return response ? [[NSString alloc] initWithUTF8String:response.get()] : @"";
#else
  return @"{\"error\":\"incompatible_abi\"}";
#endif
}

+ (NSString *)poll:(uint64_t)session {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  std::unique_ptr<char, RustStringDeleter> response(tauri_native_session_poll(session));
  return [[NSString alloc] initWithUTF8String:response.get()];
#else
  return @"{\"error\":\"incompatible_abi\"}";
#endif
}

+ (void)cancel:(uint64_t)session requestID:(NSString *)requestID {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  tauri_native_session_cancel(session, requestID.UTF8String);
#endif
}

+ (void)closeSession:(uint64_t)session {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  tauri_native_session_destroy(session);
#endif
}

@end
