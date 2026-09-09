#ifndef TAURI_NATIVE_RUNTIME_H
#define TAURI_NATIVE_RUNTIME_H
#ifdef __cplusplus
extern "C" {
#endif
// ABI 3. Input and output are UTF-8 JSON. Calls never block on Tauri commands.
char *tauri_native_runtime_request(const char *request);
void tauri_native_runtime_string_free(char *response);
#ifdef __cplusplus
}
#endif
#endif
