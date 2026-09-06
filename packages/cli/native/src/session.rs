// ABI v2 sessions own queued work and completed responses, never host callbacks.
struct __TauriNativeSession {
    closed: bool,
    next_request: u64,
    requests: std::collections::BTreeMap<String, (u64, Option<String>)>,
}

type __TauriNativeSessionRef = std::sync::Arc<std::sync::Mutex<__TauriNativeSession>>;

struct __TauriNativeJob {
    session_id: u64,
    session: __TauriNativeSessionRef,
    id: String,
    generation: u64,
    command: std::ffi::CString,
    payload: std::ffi::CString,
}

struct __TauriNativeExecutor {
    queue: std::sync::Mutex<std::collections::VecDeque<__TauriNativeJob>>,
    ready: std::sync::Condvar,
}

const __TAURI_NATIVE_PENDING_LIMIT: usize = 64;
static __TAURI_NATIVE_NEXT_SESSION: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(1);
static __TAURI_NATIVE_SESSIONS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<u64, __TauriNativeSessionRef>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));
static __TAURI_NATIVE_EXECUTOR: std::sync::LazyLock<std::sync::Arc<__TauriNativeExecutor>> =
    std::sync::LazyLock::new(|| {
        let executor = std::sync::Arc::new(__TauriNativeExecutor {
            queue: std::sync::Mutex::new(std::collections::VecDeque::new()),
            ready: std::sync::Condvar::new(),
        });
        for index in 0..2 {
            let executor = executor.clone();
            std::thread::Builder::new()
                .name(format!("tauri-native-{index}"))
                .spawn(move || loop {
                    let job = {
                        let mut queue = executor.queue.lock().unwrap();
                        while queue.is_empty() {
                            queue = executor.ready.wait(queue).unwrap();
                        }
                        queue.pop_front().unwrap()
                    };
                    {
                        let session = job.session.lock().unwrap();
                        if session.closed
                            || !session
                                .requests
                                .get(&job.id)
                                .is_some_and(|slot| slot.0 == job.generation)
                        {
                            continue;
                        }
                    }
                    // User code executes without holding either protocol lock.
                    let response =
                        unsafe { tauri_native_invoke(job.command.as_ptr(), job.payload.as_ptr()) };
                    let response = unsafe {
                        let text = std::ffi::CStr::from_ptr(response)
                            .to_string_lossy()
                            .into_owned();
                        tauri_native_string_free(response);
                        text
                    };
                    let mut session = job.session.lock().unwrap();
                    if let Some(slot) = session.requests.get_mut(&job.id) {
                        if slot.0 == job.generation {
                            slot.1 = Some(response);
                        }
                    }
                })
                .expect("create tauri-native worker");
        }
        executor
    });

fn __tauri_native_owned_json(value: serde_json::Value) -> *mut std::ffi::c_char {
    std::ffi::CString::new(value.to_string())
        .unwrap()
        .into_raw()
}

#[no_mangle]
pub extern "C" fn tauri_native_session_create() -> u64 {
    std::sync::LazyLock::force(&__TAURI_NATIVE_EXECUTOR);
    let id = __TAURI_NATIVE_NEXT_SESSION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    __TAURI_NATIVE_SESSIONS.lock().unwrap().insert(
        id,
        std::sync::Arc::new(std::sync::Mutex::new(__TauriNativeSession {
            closed: false,
            next_request: 0,
            requests: std::collections::BTreeMap::new(),
        })),
    );
    id
}

/// Null acknowledges acceptance. A non-null JSON error must be freed once.
/// Inputs must be valid, NUL-terminated UTF-8 for the duration of this call.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_session_start(
    session_id: u64,
    id: *const std::ffi::c_char,
    command: *const std::ffi::c_char,
    payload: *const std::ffi::c_char,
) -> *mut std::ffi::c_char {
    let error = |code| __tauri_native_owned_json(serde_json::json!({"error": code}));
    if id.is_null() || command.is_null() || payload.is_null() {
        return error("invalid_argument");
    }
    let Ok(id) = std::ffi::CStr::from_ptr(id).to_str() else {
        return error("invalid_argument");
    };
    if id.is_empty() {
        return error("invalid_argument");
    }
    let session = __TAURI_NATIVE_SESSIONS
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned();
    let Some(session) = session else {
        return error("closed_session");
    };
    let mut queue = __TAURI_NATIVE_EXECUTOR.queue.lock().unwrap();
    let mut state = session.lock().unwrap();
    if state.closed {
        return error("closed_session");
    }
    if state.requests.contains_key(id) {
        return error("duplicate_request");
    }
    if queue.len() >= __TAURI_NATIVE_PENDING_LIMIT
        || state.requests.len() >= __TAURI_NATIVE_PENDING_LIMIT
    {
        return error("queue_full");
    }
    state.next_request += 1;
    let generation = state.next_request;
    state.requests.insert(id.into(), (generation, None));
    queue.push_back(__TauriNativeJob {
        session_id,
        session: session.clone(),
        id: id.into(),
        generation,
        command: std::ffi::CStr::from_ptr(command).into(),
        payload: std::ffi::CStr::from_ptr(payload).into(),
    });
    __TAURI_NATIVE_EXECUTOR.ready.notify_one();
    std::ptr::null_mut()
}

/// Returns completed {id, response} entries exactly once. Free the JSON once.
#[no_mangle]
pub extern "C" fn tauri_native_session_poll(session_id: u64) -> *mut std::ffi::c_char {
    let session = __TAURI_NATIVE_SESSIONS
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned();
    let Some(session) = session else {
        return __tauri_native_owned_json(serde_json::json!({"error":"closed_session"}));
    };
    let mut state = session.lock().unwrap();
    let mut completed = Vec::new();
    state.requests.retain(|id, (_, response)| {
        if let Some(response) = response {
            completed.push(serde_json::json!({"id":id,"response":response}));
            false
        } else {
            true
        }
    });
    __tauri_native_owned_json(serde_json::Value::Array(completed))
}

/// Cancellation removes queued work and suppresses delivery of running work.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_session_cancel(session_id: u64, id: *const std::ffi::c_char) {
    if id.is_null() {
        return;
    }
    let Ok(id) = std::ffi::CStr::from_ptr(id).to_str() else {
        return;
    };
    let session = __TAURI_NATIVE_SESSIONS
        .lock()
        .unwrap()
        .get(&session_id)
        .cloned();
    if let Some(session) = session {
        let mut queue = __TAURI_NATIVE_EXECUTOR.queue.lock().unwrap();
        queue.retain(|job| job.session_id != session_id || job.id != id);
        session.lock().unwrap().requests.remove(id);
    }
}

#[no_mangle]
pub extern "C" fn tauri_native_session_destroy(session_id: u64) {
    let session = __TAURI_NATIVE_SESSIONS.lock().unwrap().remove(&session_id);
    if let Some(session) = session {
        let mut queue = __TAURI_NATIVE_EXECUTOR.queue.lock().unwrap();
        queue.retain(|job| job.session_id != session_id);
        let mut state = session.lock().unwrap();
        state.closed = true;
        state.requests.clear();
    }
}
