#ifndef TAURI_NATIVE_H
#define TAURI_NATIVE_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Invokes one command from the fixed native allowlist.
 *
 * The returned UTF-8 JSON string is owned by Rust and must be released exactly
 * once with tauri_native_string_free.
 */
char *tauri_native_invoke(const char *command, const char *payload_json);

/** Releases a non-null string returned by tauri_native_invoke. */
void tauri_native_string_free(char *value);

#ifdef __cplusplus
}
#endif

#endif
