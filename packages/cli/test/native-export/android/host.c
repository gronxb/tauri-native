#include <jni.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include "tauri_native.h"

static _Atomic int responses;
static _Atomic int frees;

JNIEXPORT jbyteArray JNICALL Java_dev_taurinative_artifacttest_MainActivity_invokeNative(
    JNIEnv *env, jclass type, jbyteArray command, jbyteArray payload) {
  (void)type;
  if (tauri_native_abi_version() != 2) {
    (*env)->ThrowNew(env, (*env)->FindClass(env, "java/lang/RuntimeException"), "Expected ABI 2");
    return NULL;
  }
  jsize command_length = (*env)->GetArrayLength(env, command);
  jsize payload_length = (*env)->GetArrayLength(env, payload);
  char *command_text = calloc((size_t)command_length + 1, 1);
  char *payload_text = calloc((size_t)payload_length + 1, 1);
  if (!command_text || !payload_text) abort();
  (*env)->GetByteArrayRegion(env, command, 0, command_length, (jbyte *)command_text);
  (*env)->GetByteArrayRegion(env, payload, 0, payload_length, (jbyte *)payload_text);
  char *response = tauri_native_invoke(command_text, payload_text);
  free(command_text); free(payload_text);
  if (!response) abort();
  responses++;
  jsize length = (jsize)strlen(response);
  jbyteArray result = (*env)->NewByteArray(env, length);
  if (result) (*env)->SetByteArrayRegion(env, result, 0, length, (const jbyte *)response);
  tauri_native_string_free(response); frees++;
  return result;
}

JNIEXPORT jintArray JNICALL Java_dev_taurinative_artifacttest_MainActivity_nativeCounts(JNIEnv *env, jclass type) {
  (void)type;
  jint values[] = {atomic_load(&responses), atomic_load(&frees)};
  jintArray result = (*env)->NewIntArray(env, 2);
  (*env)->SetIntArrayRegion(env, result, 0, 2, values);
  return result;
}
