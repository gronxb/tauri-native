use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::result::Result as Outcome;

#[derive(Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
struct Record {
    display_name: String,
    #[serde(default)]
    values: Vec<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    pair: (bool, i16),
    flags: [bool; 2],
    labels: BTreeMap<String, String>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "kebab-case")]
enum Selection {
    NoSelection,
    DisplayName(String),
    Pair(i32, bool),
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Problem {
    EmptyName { message: String },
    Empty {},
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum External {
    XMLParser,
    Pair(i32, bool),
    Entry { display_name: String },
}

#[derive(Deserialize, Serialize)]
#[serde(untagged)]
enum Flexible { Text(String), Pair(i32, bool) }

#[derive(Deserialize, Serialize)]
#[serde(transparent)]
struct Label { value: String }

#[derive(Serialize)]
struct Custom {
    #[serde(serialize_with = "as_string")]
    count: u32,
}

fn as_string<S: serde::Serializer>(value: &u32, serializer: S) -> Outcome<S::Ok, S::Error> {
    serializer.serialize_str(&value.to_string())
}

#[tauri::command]
fn save(record: Record) -> Outcome<Record, Problem> {
    if record.display_name.is_empty() { Err(Problem::EmptyName { message: "A name is required".into() }) }
    else { Ok(record) }
}

#[tauri::command]
async fn select(selection: Selection) -> Selection { selection }

#[tauri::command]
fn external(value: External) -> External { value }

#[tauri::command]
fn flexible(value: Flexible) -> Flexible { value }

#[tauri::command]
fn label(value: Label) -> Label { value }

#[tauri::command]
fn optional(display_name: Option<String>) -> Option<String> { display_name }

#[tauri::command]
fn wide(value: u64) -> u64 { value }

#[tauri::command]
fn custom() -> Custom { Custom { count: 42 } }

#[tauri::command]
fn floating() -> f64 { f64::NAN }

#[tauri::command]
fn nothing() {}

#[tauri::command]
fn unregistered() -> String { "registered later".into() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save, select, external, flexible, label, optional, wide, custom, floating, nothing])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
