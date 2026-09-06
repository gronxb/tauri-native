#[cfg(target_os = "macos")]
pub fn exchange(left: &str, right: &str) -> Result<(), String> {
    use std::ffi::CString;
    unsafe extern "C" {
        fn renamex_np(from: *const std::ffi::c_char, to: *const std::ffi::c_char, flags: u32) -> i32;
    }
    let left = CString::new(left).map_err(|e| e.to_string())?;
    let right = CString::new(right).map_err(|e| e.to_string())?;
    // Darwin sys/stdio.h: RENAME_SWAP = 0x00000002 (macOS 10.12+).
    if unsafe { renamex_np(left.as_ptr(), right.as_ptr(), 2) } != 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn exchange(_left: &str, _right: &str) -> Result<(), String> {
    Err("Atomic artifact replacement is currently verified on macOS only".into())
}
