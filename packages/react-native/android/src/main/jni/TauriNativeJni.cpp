#include <jni.h>

#include <dlfcn.h>

#include <cstring>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using InvokeFunction = char* (*)(const char*, const char*);
using FreeFunction = void (*)(char*);

struct RustApi {
  void* library;
  InvokeFunction invoke;
  FreeFunction freeString;
};

template <typename Function>
Function loadSymbol(void* library, const char* name) {
  dlerror();
  auto* symbol = dlsym(library, name);
  if (const auto* error = dlerror()) {
    throw std::runtime_error(error);
  }
  return reinterpret_cast<Function>(symbol);
}

const RustApi& rustApi() {
  static const RustApi api = [] {
    void* library = dlopen(
      "libtauri_native_core.so",
      RTLD_NOW | RTLD_LOCAL
    );
    if (!library) {
      throw std::runtime_error(dlerror());
    }

    return RustApi{
      library,
      loadSymbol<InvokeFunction>(library, "tauri_native_invoke"),
      loadSymbol<FreeFunction>(library, "tauri_native_string_free"),
    };
  }();
  return api;
}

std::vector<char> utf8Bytes(JNIEnv* env, jbyteArray value) {
  const auto length = env->GetArrayLength(value);
  std::vector<char> bytes(static_cast<std::size_t>(length) + 1, '\0');
  env->GetByteArrayRegion(
    value,
    0,
    length,
    reinterpret_cast<jbyte*>(bytes.data())
  );
  return bytes;
}

void throwJavaException(JNIEnv* env, const char* message) {
  const auto exception = env->FindClass("java/lang/RuntimeException");
  if (exception) {
    env->ThrowNew(exception, message);
  }
}

} // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_reactnativetauri_TauriNativeRust_invokeBytes(
  JNIEnv* env,
  jobject,
  jbyteArray commandValue,
  jbyteArray payloadValue
) {
  if (!commandValue || !payloadValue) {
    throwJavaException(env, "command and payload must not be null");
    return nullptr;
  }

  try {
    const auto command = utf8Bytes(env, commandValue);
    const auto payload = utf8Bytes(env, payloadValue);
    if (env->ExceptionCheck()) {
      return nullptr;
    }

    const auto& api = rustApi();
    std::unique_ptr<char, FreeFunction> response(
      api.invoke(command.data(), payload.data()),
      api.freeString
    );
    if (!response) {
      throw std::runtime_error("Rust returned a null response");
    }

    const auto responseLength = std::strlen(response.get());
    const auto result = env->NewByteArray(
      static_cast<jsize>(responseLength)
    );
    if (!result) {
      return nullptr;
    }
    env->SetByteArrayRegion(
      result,
      0,
      static_cast<jsize>(responseLength),
      reinterpret_cast<const jbyte*>(response.get())
    );
    return result;
  } catch (const std::exception& error) {
    throwJavaException(env, error.what());
    return nullptr;
  }
}
