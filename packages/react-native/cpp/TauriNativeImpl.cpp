#include "TauriNativeImpl.h"

#include "tauri_native.h"

#include <memory>
#include <stdexcept>

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
  const auto commandUtf8 = command.utf8(runtime);
  const auto payloadUtf8 = payloadJson.utf8(runtime);
  std::unique_ptr<char, RustStringDeleter> response(
    tauri_native_invoke(commandUtf8.c_str(), payloadUtf8.c_str())
  );
  if (!response) {
    throw std::runtime_error("Rust returned a null response");
  }

  return jsi::String::createFromUtf8(runtime, response.get());
}

} // namespace facebook::react
