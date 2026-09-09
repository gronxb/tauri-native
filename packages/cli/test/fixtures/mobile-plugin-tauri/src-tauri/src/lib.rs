use serde::{Deserialize, Serialize};
use tauri_plugin_deep_link::DeepLinkExt;
use std::sync::{atomic::{AtomicU32, Ordering}, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

struct Counter(Mutex<i32>);
static SETUP_COUNT: AtomicU32 = AtomicU32::new(0);
static PLUGIN_SETUP_COUNT: AtomicU32 = AtomicU32::new(0);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    value: i32,
    setup_count: u32,
    plugin_setup_count: u32,
    app_identifier: String,
}

#[tauri::command]
fn snapshot(app: AppHandle, state: State<'_, Counter>) -> Snapshot {
    let value = *state.0.lock().unwrap();
    // Both injection and AppHandle must reach the same application-owned state.
    assert_eq!(value, *app.state::<Counter>().0.lock().unwrap());
    Snapshot {
        value,
        setup_count: SETUP_COUNT.load(Ordering::SeqCst),
        plugin_setup_count: PLUGIN_SETUP_COUNT.load(Ordering::SeqCst),
        app_identifier: app.config().identifier.clone(),
    }
}

#[tauri::command]
fn increment(app: AppHandle, delta: i32) -> Result<Snapshot, String> {
    if delta <= 0 {
        return Err("Use a positive delta.".into());
    }
    *app.state::<Counter>().0.lock().unwrap() += delta;
    let result = snapshot(app.clone(), app.state::<Counter>());
    app.emit("counter-changed", &result).map_err(|error| error.to_string())?;
    Ok(result)
}

#[tauri::command]
async fn increment_async(app: AppHandle, delta: i32) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || increment(app, delta))
        .await
        .map_err(|error| error.to_string())?
}

mod probe_plugin {
    use super::*;

    pub struct Calls(pub AtomicU32);

    #[tauri::command]
    pub fn read(state: State<'_, Calls>) -> u32 {
        state.0.load(Ordering::SeqCst)
    }

    #[tauri::command]
    pub fn forbidden(state: State<'_, Calls>) {
        state.0.fetch_add(1, Ordering::SeqCst);
    }

    pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
        tauri::plugin::Builder::new("runtime-probe")
            .setup(|app, _| {
                PLUGIN_SETUP_COUNT.fetch_add(1, Ordering::SeqCst);
                app.manage(Calls(AtomicU32::new(0)));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![read, forbidden])
            .build()
    }
}

#[tauri::command]
fn record_report(app: AppHandle, report: serde_json::Value) -> Result<(), String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let temporary = directory.join("runtime-report.tmp");
    std::fs::write(&temporary, serde_json::to_vec(&report).unwrap()).map_err(|error| error.to_string())?;
    let filename = if report.get("kind").and_then(|kind| kind.as_str()) == Some("plugins") { "plugins-report.json" } else { "runtime-report.json" };
    std::fs::rename(temporary, directory.join(filename)).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(probe_plugin::init())
        .plugin(tauri_plugin_geolocation::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            SETUP_COUNT.fetch_add(1, Ordering::SeqCst);
            app.manage(Counter(Mutex::new(40)));
            let directory = app.path().app_data_dir()?;
            let notes = match std::fs::read(directory.join("notes.json")) {
                Ok(bytes) => serde_json::from_slice(&bytes)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
                Err(error) => return Err(error.into()),
            };
            app.manage(NoteBook(Mutex::new(notes)));
            app.manage(OpenedLinks(Mutex::new(Vec::new())));
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                handle.state::<OpenedLinks>().0.lock().unwrap().extend(event.urls().into_iter().map(|url| url.to_string()));
                let _ = handle.emit("fieldnotes-updated", ());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![snapshot, increment, increment_async, record_report, list_notes, save_note, plugin_snapshot])
        .run(tauri::generate_context!())
        .expect("run ordinary Tauri runtime fixture");
}


struct NoteBook(Mutex<Vec<Note>>);
struct OpenedLinks(Mutex<Vec<String>>);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: u32,
    text: String,
    latitude: f64,
    longitude: f64,
}

#[tauri::command]
fn list_notes(state: State<'_, NoteBook>) -> Vec<Note> { state.0.lock().unwrap().clone() }

#[tauri::command]
async fn save_note(app: AppHandle, text: String, latitude: f64, longitude: f64) -> Result<Note, String> {
    if text.trim().is_empty() || !latitude.is_finite() || !longitude.is_finite() || latitude.abs() > 90.0 || longitude.abs() > 180.0 {
        return Err("A note needs text and valid coordinates.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<NoteBook>();
        let mut notes = state.0.lock().unwrap();
        let note = Note { id: notes.last().map_or(1, |note| note.id + 1), text, latitude, longitude };
        let mut updated = notes.clone();
        updated.push(note.clone());
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let temporary = directory.join("notes.tmp");
        std::fs::write(&temporary, serde_json::to_vec(&updated).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::rename(temporary, directory.join("notes.json")).map_err(|e| e.to_string())?;
        *notes = updated;
        drop(notes);
        app.emit("fieldnotes-updated", ()).map_err(|e| e.to_string())?;
        Ok(note)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn plugin_snapshot(app: AppHandle) -> serde_json::Value {
    serde_json::json!({
        "platform": std::env::consts::OS,
        "links": app.state::<OpenedLinks>().0.lock().unwrap().clone(),
        "notes": app.state::<NoteBook>().0.lock().unwrap().clone(),
        "setupCount": SETUP_COUNT.load(Ordering::SeqCst),
        "pluginSetupCount": PLUGIN_SETUP_COUNT.load(Ordering::SeqCst),
    })
}
