use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Condvar, LazyLock, Mutex},
    time::Duration,
};

#[derive(Clone, Default, Serialize)]
struct WorkStatus {
    started: u32,
    completed: u32,
}

static WORK: LazyLock<Mutex<BTreeMap<String, WorkStatus>>> =
    LazyLock::new(|| Mutex::new(BTreeMap::new()));
static RELEASED: LazyLock<(Mutex<BTreeSet<String>>, Condvar)> =
    LazyLock::new(|| (Mutex::new(BTreeSet::new()), Condvar::new()));

fn record(label: &str, started: bool) {
    let mut work = WORK.lock().unwrap();
    let status = work.entry(label.to_owned()).or_default();
    if started {
        status.started += 1;
    } else {
        status.completed += 1;
    }
}

#[tauri::command]
async fn delayed(label: String, milliseconds: u64) -> String {
    record(&label, true);
    tokio::time::sleep(Duration::from_millis(milliseconds)).await;
    record(&label, false);
    label
}

#[tauri::command]
fn blocking(label: String, milliseconds: u64) -> String {
    record(&label, true);
    std::thread::sleep(Duration::from_millis(milliseconds));
    record(&label, false);
    label
}

#[tauri::command]
fn held(label: String) -> String {
    record(&label, true);
    let mut released = RELEASED.0.lock().unwrap();
    while !released.remove(&label) {
        released = RELEASED.1.wait(released).unwrap();
    }
    drop(released);
    record(&label, false);
    label
}

#[tauri::command]
fn release(label: String) {
    RELEASED.0.lock().unwrap().insert(label);
    RELEASED.1.notify_all();
}

#[tauri::command]
fn work_status() -> BTreeMap<String, WorkStatus> {
    WORK.lock().unwrap().clone()
}

#[derive(Serialize)]
struct Problem {
    kind: &'static str,
}

#[tauri::command]
async fn domain_failure() -> Result<(), Problem> {
    std::future::ready(Err(Problem {
        kind: "expected_failure",
    }))
    .await
}

#[tauri::command]
fn nothing() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            delayed,
            blocking,
            held,
            release,
            work_status,
            domain_failure,
            nothing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
