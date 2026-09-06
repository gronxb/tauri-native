#pragma once
#include <stdint.h>

#define TAURI_NATIVE_ABI_VERSION 2
#ifdef __cplusplus
extern "C" {
#endif

uint32_t tauri_native_abi_version(void);
/* Sessions run commands on two shared workers. Start returns NULL on acceptance
 * or owned JSON {error: code}. Poll returns an owned array of {id, response}
 * entries. Both use tauri_native_string_free. Cancel/destroy suppress delivery;
 * already running Rust work can still finish and commit side effects. */
uint64_t tauri_native_session_create(void);
char *tauri_native_session_start(uint64_t session, const char *id, const char *command, const char *payload);
char *tauri_native_session_poll(uint64_t session);
void tauri_native_session_cancel(uint64_t session, const char *id);
void tauri_native_session_destroy(uint64_t session);
/* UTF-8 command and JSON payload. Each non-null response is owned by the caller
 * and must be released exactly once with tauri_native_string_free. */
char *tauri_native_invoke(const char *command, const char *payload);
void tauri_native_string_free(char *value);

#ifdef __cplusplus
}
#endif
