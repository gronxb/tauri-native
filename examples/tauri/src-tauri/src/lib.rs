#[tauri::command]
fn calculate(expression: String) -> serde_json::Value {
    let payload = serde_json::json!({ "expression": expression }).to_string();
    serde_json::from_str(&tauri_native_example_core::invoke_json(
        "calculate",
        &payload,
    ))
    .expect("the shared core always returns JSON")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![calculate])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn tauri_command_uses_the_shared_calculator() {
        let value = super::calculate("(9 + 5) * 3".into());

        assert_eq!(value["ok"], true);
        assert_eq!(value["value"]["result"], 42.0);
        assert_eq!(value["value"]["source"], "tauri-native-example-core");
    }
}
