#[cfg(feature = "greeting")]
#[tauri::command]
fn greet() -> String { "Hello".into() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()

        .invoke_handler(tauri::generate_handler![#[cfg(feature = "greeting")] greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
