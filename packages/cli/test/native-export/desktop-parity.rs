// Test-only adapter appended to a separate copy. MockRuntime is never exported.
#[cfg(test)]
mod export_parity {
    #[test]
    fn original_tauri_handler() {
        let app = tauri::test::mock_builder()
            .invoke_handler(tauri::generate_handler![super::describe, super::greet])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let view = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let requests: Vec<serde_json::Value> = serde_json::from_str(
            &std::fs::read_to_string(std::env::var("SPIKE_REQUESTS").unwrap()).unwrap(),
        )
        .unwrap();
        let responses: Vec<serde_json::Value> = requests.into_iter().map(|request| {
            let result = tauri::test::get_ipc_response(&view, tauri::webview::InvokeRequest {
                cmd: request["command"].as_str().unwrap().into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(request["payload"].clone()),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.into(),
            });
            match result {
                Ok(value) => serde_json::json!({"ok": true, "value": value.deserialize::<serde_json::Value>().unwrap()}),
                Err(error) => serde_json::json!({"ok": false, "error": error}),
            }
        }).collect();
        std::fs::write(
            std::env::var("SPIKE_DESKTOP_RESULT").unwrap(),
            serde_json::to_vec(&responses).unwrap(),
        )
        .unwrap();
    }
}
