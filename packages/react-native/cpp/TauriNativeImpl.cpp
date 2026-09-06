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
  std::shared_ptr<CallInvoker> jsInvoker, std::string appDataDirectory
)
  : NativeTauriCxxSpec(std::move(jsInvoker)), appDataDirectory_(std::move(appDataDirectory)) {}

jsi::String TauriNativeImpl::appDataDir(jsi::Runtime& runtime) {
  return jsi::String::createFromUtf8(runtime, appDataDirectory_);
}

jsi::String TauriNativeImpl::invoke(
  jsi::Runtime& runtime,
  jsi::String command,
  jsi::String payloadJson
) {
#if defined(TAURI_NATIVE_ABI_VERSION)
  if ((TAURI_NATIVE_ABI_VERSION != 1 && TAURI_NATIVE_ABI_VERSION != 2) || tauri_native_abi_version() != TAURI_NATIVE_ABI_VERSION) {
    throw std::runtime_error("Incompatible tauri-native ABI");
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

TauriNativeImpl::~TauriNativeImpl() {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  for (const auto& entry : sessions_) tauri_native_session_destroy(entry.second);
#endif
}

jsi::String TauriNativeImpl::createSession(jsi::Runtime& runtime) {
  std::string id;
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  if (tauri_native_abi_version() == 2) {
    const auto session = tauri_native_session_create();
    id = std::to_string(session);
    sessions_.emplace(id, session);
  }
#endif
  return jsi::String::createFromUtf8(runtime, id);
}

jsi::String TauriNativeImpl::start(jsi::Runtime& runtime, jsi::String session, jsi::String id, jsi::String command, jsi::String payload) {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  const auto found = sessions_.find(session.utf8(runtime));
  if (found != sessions_.end()) {
    const auto request = id.utf8(runtime), name = command.utf8(runtime), json = payload.utf8(runtime);
    for (const auto* value : {&request, &name, &json}) {
      if (value->find('\0') != std::string::npos) throw std::runtime_error("Request text contains NUL");
    }
    std::unique_ptr<char, RustStringDeleter> response(tauri_native_session_start(found->second, request.c_str(), name.c_str(), json.c_str()));
    return jsi::String::createFromUtf8(runtime, response ? response.get() : "");
  }
#endif
  return jsi::String::createFromUtf8(runtime, "{\"error\":\"closed_session\"}");
}

jsi::String TauriNativeImpl::poll(jsi::Runtime& runtime, jsi::String session) {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  const auto found = sessions_.find(session.utf8(runtime));
  if (found != sessions_.end()) {
    std::unique_ptr<char, RustStringDeleter> response(tauri_native_session_poll(found->second));
    return jsi::String::createFromUtf8(runtime, response.get());
  }
#endif
  return jsi::String::createFromUtf8(runtime, "{\"error\":\"closed_session\"}");
}

void TauriNativeImpl::cancel(jsi::Runtime& runtime, jsi::String session, jsi::String id) {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  const auto found = sessions_.find(session.utf8(runtime));
  if (found != sessions_.end()) tauri_native_session_cancel(found->second, id.utf8(runtime).c_str());
#endif
}

void TauriNativeImpl::closeSession(jsi::Runtime& runtime, jsi::String session) {
#if defined(TAURI_NATIVE_ABI_VERSION) && TAURI_NATIVE_ABI_VERSION == 2
  const auto found = sessions_.find(session.utf8(runtime));
  if (found != sessions_.end()) {
    tauri_native_session_destroy(found->second);
    sessions_.erase(found);
  }
#endif
}

} // namespace facebook::react
