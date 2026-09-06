#pragma once

#include <TauriNativeSpecJSI.h>

#include <memory>
#include <cstdint>
#include <string>
#include <unordered_map>

namespace facebook::react {

class TauriNativeImpl final
  : public NativeTauriCxxSpec<TauriNativeImpl> {
public:
  explicit TauriNativeImpl(std::shared_ptr<CallInvoker> jsInvoker);
  ~TauriNativeImpl() override;

  jsi::String invoke(
    jsi::Runtime& runtime,
    jsi::String command,
    jsi::String payloadJson
  );
  jsi::String createSession(jsi::Runtime& runtime);
  jsi::String start(jsi::Runtime& runtime, jsi::String session, jsi::String id, jsi::String command, jsi::String payload);
  jsi::String poll(jsi::Runtime& runtime, jsi::String session);
  void cancel(jsi::Runtime& runtime, jsi::String session, jsi::String id);
  void closeSession(jsi::Runtime& runtime, jsi::String session);

private:
  std::unordered_map<std::string, std::uint64_t> sessions_;
};

} // namespace facebook::react
