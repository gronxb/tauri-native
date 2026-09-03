#pragma once

#include <TauriNativeSpecJSI.h>

#include <memory>

namespace facebook::react {

class TauriNativeImpl final
  : public NativeTauriCxxSpec<TauriNativeImpl> {
public:
  explicit TauriNativeImpl(std::shared_ptr<CallInvoker> jsInvoker);

  jsi::String invoke(
    jsi::Runtime& runtime,
    jsi::String command,
    jsi::String payloadJson
  );
};

} // namespace facebook::react
