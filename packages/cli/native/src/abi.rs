// ABI v2: owned UTF-8 JSON responses plus nonblocking request sessions.
#[no_mangle]
pub extern "C" fn tauri_native_abi_version() -> u32 { 2 }

// Tool-owned ABI appended to the disposable build copy, never the producer.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_invoke(
    command: *const std::ffi::c_char,
    payload: *const std::ffi::c_char,
) -> *mut std::ffi::c_char {
    let result = std::panic::catch_unwind(|| {
        if command.is_null() || payload.is_null() {
            return Err(serde_json::Value::String("null argument".into()));
        }
        let command = std::ffi::CStr::from_ptr(command)
            .to_str()
            .map_err(|e| serde_json::Value::String(e.to_string()))?;
        let payload = std::ffi::CStr::from_ptr(payload)
            .to_str()
            .map_err(|e| serde_json::Value::String(e.to_string()))?;
        let payload =
            serde_json::from_str(payload).map_err(|e| serde_json::Value::String(e.to_string()))?;
        __tauri_native_dispatch(command, payload)
    })
    .unwrap_or_else(|_| Err(serde_json::Value::String("Rust command panicked".into())));
    let envelope = match result {
        Ok(value) => serde_json::json!({"abiVersion": 2, "ok": true, "value": value}),
        Err(error) => serde_json::json!({"abiVersion": 2, "ok": false, "error": error}),
    };
    std::ffi::CString::new(envelope.to_string())
        .unwrap()
        .into_raw()
}

/// # Safety
/// Non-null pointers must come from an ABI string-returning function and be freed once.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_string_free(value: *mut std::ffi::c_char) {
    if !value.is_null() {
        drop(std::ffi::CString::from_raw(value));
    }
}
