#include "TauriNativeImpl.h"

#include "tauri_native.h"

#include <memory>
#include <stdexcept>
#include <string>

namespace {

struct RustStringDeleter {
  void operator()(char* value) const {
    tauri_native_string_free(value);
  }
};

} // namespace

namespace facebook::react {

TauriNativeImpl::TauriNativeImpl(
  std::shared_ptr<CallInvoker> jsInvoker
)
  : NativeTauriCxxSpec(std::move(jsInvoker)) {}

jsi::String TauriNativeImpl::invoke(
  jsi::Runtime& runtime,
  jsi::String command,
  jsi::String payloadJson
) {
#if defined(TAURI_NATIVE_ABI_VERSION)
  if (TAURI_NATIVE_ABI_VERSION != 1 || tauri_native_abi_version() != 1) {
    throw std::runtime_error("Expected tauri-native ABI 1");
  }
#endif
  const auto commandUtf8 = command.utf8(runtime);
  const auto payloadUtf8 = payloadJson.utf8(runtime);
  if (commandUtf8.find('\0') != std::string::npos) {
    throw std::runtime_error("Command contains NUL");
  }
  std::unique_ptr<char, RustStringDeleter> response(
    tauri_native_invoke(commandUtf8.c_str(), payloadUtf8.c_str())
  );
  if (!response) {
    throw std::runtime_error("Rust returned a null response");
  }

  return jsi::String::createFromUtf8(runtime, response.get());
}

} // namespace facebook::react
