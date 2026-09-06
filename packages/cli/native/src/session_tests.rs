use serde_json::{json, Value};
use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::sync::{Condvar, LazyLock, Mutex};
use std::time::{Duration, Instant};

include!("abi.rs");
include!("session.rs");

#[derive(Default)]
struct Commands {
    started: HashSet<String>,
    released: HashSet<String>,
    effects: HashSet<String>,
}
static COMMANDS: LazyLock<(Mutex<Commands>, Condvar)> =
    LazyLock::new(|| (Mutex::new(Commands::default()), Condvar::new()));

fn __tauri_native_dispatch(command: &str, payload: Value) -> Result<Value, Value> {
    let label = payload.as_str().unwrap().to_owned();
    let (state, changed) = &*COMMANDS;
    let mut state = state.lock().unwrap();
    state.started.insert(label.clone());
    changed.notify_all();
    while command == "hold" && !state.released.contains(&label) {
        state = changed.wait(state).unwrap();
    }
    state.effects.insert(label.clone());
    changed.notify_all();
    Ok(json!(label))
}

fn owned(value: *mut std::ffi::c_char) -> Value {
    assert!(!value.is_null());
    unsafe {
        let parsed = serde_json::from_str(CStr::from_ptr(value).to_str().unwrap()).unwrap();
        tauri_native_string_free(value);
        parsed
    }
}

fn start(session: u64, id: &str, command: &str, label: &str) -> Option<Value> {
    let id = CString::new(id).unwrap();
    let command = CString::new(command).unwrap();
    let payload = CString::new(json!(label).to_string()).unwrap();
    let result = unsafe {
        tauri_native_session_start(session, id.as_ptr(), command.as_ptr(), payload.as_ptr())
    };
    if result.is_null() {
        None
    } else {
        Some(owned(result))
    }
}

fn cancel(session: u64, id: &str) {
    unsafe {
        tauri_native_session_cancel(session, CString::new(id).unwrap().as_ptr());
    }
}

fn wait_started(labels: &[&str]) {
    let deadline = Instant::now() + Duration::from_secs(5);
    let (state, changed) = &*COMMANDS;
    let mut state = state.lock().unwrap();
    while !labels.iter().all(|label| state.started.contains(*label)) {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .expect("workers did not start");
        state = changed.wait_timeout(state, remaining).unwrap().0;
    }
}

fn release(label: &str) {
    let (state, changed) = &*COMMANDS;
    state.lock().unwrap().released.insert(label.into());
    changed.notify_all();
}

fn completed(session: u64, id: &str, label: &str) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let result = owned(tauri_native_session_poll(session));
        if result != json!([]) {
            assert_eq!(
                result,
                json!([{"id":id,"response":json!({"abiVersion":2,"ok":true,"value":label}).to_string()}])
            );
            assert_eq!(
                owned(tauri_native_session_poll(session)),
                json!([]),
                "deliver exactly once"
            );
            return;
        }
        assert!(Instant::now() < deadline, "request did not complete");
        std::thread::sleep(Duration::from_millis(1));
    }
}

#[test]
fn concurrent_work_cancellation_reused_ids_capacity_and_teardown() {
    let session = tauri_native_session_create();
    assert_eq!(start(session, "slow", "hold", "original"), None);
    wait_started(&["original"]);
    assert_eq!(start(session, "fast", "mark", "fast"), None);
    completed(session, "fast", "fast"); // The earlier slow command is still blocked.
    assert_eq!(
        start(session, "slow", "mark", "duplicate"),
        Some(json!({"error":"duplicate_request"}))
    );

    cancel(session, "slow");
    assert_eq!(start(session, "slow", "hold", "replacement"), None);
    wait_started(&["replacement"]);
    release("original");
    assert_eq!(start(session, "barrier", "mark", "after-original"), None);
    completed(session, "barrier", "after-original"); // Old result must not complete the reused ID.
    assert!(
        COMMANDS.0.lock().unwrap().effects.contains("original"),
        "running cancellation preserves side effects"
    );
    release("replacement");
    completed(session, "slow", "replacement");

    assert_eq!(start(session, "block-a", "hold", "block-a"), None);
    assert_eq!(start(session, "block-b", "hold", "block-b"), None);
    wait_started(&["block-a", "block-b"]);
    assert_eq!(
        start(session, "cancel-queued", "mark", "cancel-queued"),
        None
    );
    cancel(session, "cancel-queued");

    let queued = tauri_native_session_create();
    for index in 0..64 {
        assert_eq!(start(queued, &index.to_string(), "mark", "discarded"), None);
    }
    assert_eq!(
        start(queued, "overflow", "mark", "overflow"),
        Some(json!({"error":"queue_full"}))
    );
    let other = tauri_native_session_create();
    assert_eq!(
        start(other, "overflow", "mark", "overflow"),
        Some(json!({"error":"queue_full"}))
    );
    cancel(queued, "0");
    assert_eq!(start(other, "accepted", "mark", "accepted"), None);
    tauri_native_session_destroy(queued); // Drops queued work and immediately releases capacity.
    assert_eq!(
        owned(tauri_native_session_poll(queued)),
        json!({"error":"closed_session"})
    );
    assert_eq!(
        start(queued, "closed", "mark", "closed"),
        Some(json!({"error":"closed_session"}))
    );

    tauri_native_session_destroy(session); // Both running tasks can finish, with no delivery.
    release("block-a");
    release("block-b");
    completed(other, "accepted", "accepted");
    assert_eq!(
        owned(tauri_native_session_poll(session)),
        json!({"error":"closed_session"})
    );
    let effects = &COMMANDS.0.lock().unwrap().effects;
    for label in [
        "duplicate",
        "cancel-queued",
        "discarded",
        "overflow",
        "closed",
    ] {
        assert!(!effects.contains(label), "unexpected side effect: {label}");
    }
    tauri_native_session_destroy(other);
    tauri_native_session_destroy(other); // A late teardown is harmless.
}
