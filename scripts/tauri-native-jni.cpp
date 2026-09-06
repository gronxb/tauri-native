#include <jni.h>

#include <dlfcn.h>

#include <algorithm>
#include <cstdint>
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
  std::uint64_t (*createSession)();
  char* (*start)(std::uint64_t, const char*, const char*, const char*);
  char* (*poll)(std::uint64_t);
  void (*cancel)(std::uint64_t, const char*);
  void (*closeSession)(std::uint64_t);
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

    try {
      auto version = reinterpret_cast<std::uint32_t (*)()>(dlsym(library, "tauri_native_abi_version"));
      const auto abi = version ? version() : 0;
      if (abi > 2) throw std::runtime_error("Incompatible tauri-native ABI");
      RustApi result{};
      result.library = library;
      result.invoke = loadSymbol<InvokeFunction>(library, "tauri_native_invoke");
      result.freeString = loadSymbol<FreeFunction>(library, "tauri_native_string_free");
      if (abi == 2) {
        result.createSession = loadSymbol<decltype(result.createSession)>(library, "tauri_native_session_create");
        result.start = loadSymbol<decltype(result.start)>(library, "tauri_native_session_start");
        result.poll = loadSymbol<decltype(result.poll)>(library, "tauri_native_session_poll");
        result.cancel = loadSymbol<decltype(result.cancel)>(library, "tauri_native_session_cancel");
        result.closeSession = loadSymbol<decltype(result.closeSession)>(library, "tauri_native_session_destroy");
      }
      return result;
    } catch (...) {
      dlclose(library);
      throw;
    }
  }();
  return api;
}

std::vector<char> utf8Bytes(JNIEnv* env, jbyteArray value) {
  if (!value) throw std::runtime_error("Request text must not be null");
  const auto length = env->GetArrayLength(value);
  std::vector<char> bytes(static_cast<std::size_t>(length) + 1, '\0');
  env->GetByteArrayRegion(
    value,
    0,
    length,
    reinterpret_cast<jbyte*>(bytes.data())
  );
  if (std::find(bytes.begin(), bytes.end() - 1, '\0') != bytes.end() - 1) {
    throw std::runtime_error("Command or JSON text contains NUL");
  }
  return bytes;
}

void throwJavaException(JNIEnv* env, const char* message) {
  const auto exception = env->FindClass("java/lang/RuntimeException");
  if (exception) {
    env->ThrowNew(exception, message);
  }
}

jbyteArray javaBytes(JNIEnv* env, const RustApi& api, char* value) {
  std::unique_ptr<char, FreeFunction> response(value, api.freeString);
  const char* text = response ? response.get() : "";
  const auto length = static_cast<jsize>(std::strlen(text));
  const auto result = env->NewByteArray(length);
  if (result) env->SetByteArrayRegion(result, 0, length, reinterpret_cast<const jbyte*>(text));
  return result;
}

} // namespace

extern "C" JNIEXPORT jbyteArray JNICALL
__TAURI_NATIVE_JNI_CLASS___invokeBytes(
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
    auto* response = api.invoke(command.data(), payload.data());
    if (!response) {
      throw std::runtime_error("Rust returned a null response");
    }

    return javaBytes(env, api, response);
  } catch (const std::exception& error) {
    throwJavaException(env, error.what());
    return nullptr;
  }
}

extern "C" JNIEXPORT jlong JNICALL
__TAURI_NATIVE_JNI_CLASS___createSession(JNIEnv* env, jobject) {
  try { const auto& api = rustApi(); return api.createSession ? static_cast<jlong>(api.createSession()) : 0; }
  catch (const std::exception& error) { throwJavaException(env, error.what()); return 0; }
}

extern "C" JNIEXPORT jbyteArray JNICALL
__TAURI_NATIVE_JNI_CLASS___startBytes(JNIEnv* env, jobject, jlong session, jbyteArray idValue, jbyteArray commandValue, jbyteArray payloadValue) {
  try {
    const auto id = utf8Bytes(env, idValue), command = utf8Bytes(env, commandValue), payload = utf8Bytes(env, payloadValue);
    if (env->ExceptionCheck()) return nullptr;
    const auto& api = rustApi();
    if (!api.start) throw std::runtime_error("Async invocation requires ABI 2 artifacts");
    return javaBytes(env, api, api.start(session, id.data(), command.data(), payload.data()));
  } catch (const std::exception& error) { throwJavaException(env, error.what()); return nullptr; }
}

extern "C" JNIEXPORT jbyteArray JNICALL
__TAURI_NATIVE_JNI_CLASS___pollBytes(JNIEnv* env, jobject, jlong session) {
  try {
    const auto& api = rustApi();
    if (!api.poll) throw std::runtime_error("Async invocation requires ABI 2 artifacts");
    return javaBytes(env, api, api.poll(session));
  } catch (const std::exception& error) { throwJavaException(env, error.what()); return nullptr; }
}

extern "C" JNIEXPORT void JNICALL
__TAURI_NATIVE_JNI_CLASS___cancelBytes(JNIEnv* env, jobject, jlong session, jbyteArray idValue) {
  try {
    const auto id = utf8Bytes(env, idValue);
    if (env->ExceptionCheck()) return;
    const auto& api = rustApi();
    if (api.cancel) api.cancel(session, id.data());
  } catch (const std::exception& error) { throwJavaException(env, error.what()); }
}

extern "C" JNIEXPORT void JNICALL
__TAURI_NATIVE_JNI_CLASS___closeSession(JNIEnv* env, jobject, jlong session) {
  try { const auto& api = rustApi(); if (api.closeSession) api.closeSession(session); }
  catch (const std::exception& error) { throwJavaException(env, error.what()); }
}
