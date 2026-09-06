use serde::{Deserialize, Serialize};
use std::result::Result as Outcome;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    display_name: String,
    values: Vec<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Reply {
    display_name: String,
    total: i32,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Problem {
    EmptyName { message: String },
}

#[tauri::command]
fn describe(request: Request) -> Outcome<Reply, Problem> {
    if request.display_name.is_empty() {
        return Err(Problem::EmptyName {
            message: "A name is required".into(),
        });
    }
    Ok(Reply {
        display_name: request.display_name,
        total: request.values.iter().sum(),
    })
}

#[tauri::command]
fn greet(display_name: String) -> String {
    format!("Hello, {display_name}!")
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "kebab-case")]
enum Selection {
    NoSelection,
    DisplayName(String),
}

#[tauri::command]
fn select(selection: Selection) -> Selection {
    selection
}

#[tauri::command]
fn optional(display_name: Option<String>) -> Option<String> {
    display_name
}

#[tauri::command]
fn nothing() {}

#[tauri::command]
fn unregistered() -> &'static str {
    "This function is deliberately not registered"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            describe, greet, select, optional, nothing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
