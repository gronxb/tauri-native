use jni::{objects::{JClass, JString}, sys::jstring, JNIEnv};
use std::ffi::{CStr, CString};

#[no_mangle]
pub extern "system" fn Java_dev_taurinative_runtime_RuntimeSession_request(
    mut env: JNIEnv, _class: JClass, input: JString,
) -> jstring {
    let result = (|| -> Result<jstring, Box<dyn std::error::Error>> {
        let text: String = env.get_string(&input)?.into();
        let input = CString::new(text)?;
        unsafe {
            let response = super::tauri_native_runtime_request(input.as_ptr());
            let value = env.new_string(CStr::from_ptr(response).to_str()?)
                .map(|value| value.into_raw());
            super::tauri_native_runtime_string_free(response);
            Ok(value?)
        }
    })();
    match result {
        Ok(value) => value,
        Err(error) => {
            let _ = env.throw_new("java/lang/IllegalStateException", error.to_string());
            std::ptr::null_mut()
        }
    }
}
