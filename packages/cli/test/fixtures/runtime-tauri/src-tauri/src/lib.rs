use serde::Serialize;
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
    std::fs::rename(temporary, directory.join("runtime-report.json")).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(probe_plugin::init())
        .setup(|app| {
            SETUP_COUNT.fetch_add(1, Ordering::SeqCst);
            app.manage(Counter(Mutex::new(40)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![snapshot, increment, increment_async, record_report])
        .run(tauri::generate_context!())
        .expect("run ordinary Tauri runtime fixture");
}
