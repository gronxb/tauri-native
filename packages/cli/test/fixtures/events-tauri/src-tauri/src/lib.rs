#[tauri::command]
fn record(report: String) -> Result<(), String> {
    if let Ok(path) = std::env::var("TAURI_EVENT_REPORT") {
        std::fs::write(path, report).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![record])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
