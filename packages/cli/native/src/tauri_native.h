#pragma once
#include <stdint.h>

#define TAURI_NATIVE_ABI_VERSION 1
#ifdef __cplusplus
extern "C" {
#endif

uint32_t tauri_native_abi_version(void);
/* UTF-8 command and JSON payload. Each non-null response is owned by the caller
 * and must be released exactly once with tauri_native_string_free. */
char *tauri_native_invoke(const char *command, const char *payload);
void tauri_native_string_free(char *value);

#ifdef __cplusplus
}
#endif
