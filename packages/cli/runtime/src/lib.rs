use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::{c_char, CStr, CString},
    sync::{LazyLock, Mutex},
};
use tauri::{
    ipc::{CallbackFn, InvokeBody, InvokeResponse, InvokeResponseBody},
    webview::InvokeRequest,
    AppHandle, Manager, RunEvent, Wry,
};

#[cfg(target_os = "android")]
mod android;
mod events;

const MAX_SESSIONS: usize = 32;
const MAX_REQUESTS: usize = 128;
const MAX_PAYLOAD: usize = 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Caller {
    webview: String,
    commands: BTreeSet<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    version: u32,
    callers: BTreeMap<String, Caller>,
}

struct Session {
    caller: Caller,
    requests: BTreeMap<u64, Request>,
    events: events::Events,
}

#[derive(Default)]
struct Request {
    response: Option<Value>,
    subscription: Option<u64>,
}

enum Operation {
    Invoke { command: String, payload: Value },
    Listen { event: String },
    Events,
}

impl Operation {
    fn permission(&self) -> &str {
        match self {
            Self::Invoke { command, .. } => command,
            Self::Listen { .. } | Self::Events => "plugin:event|listen",
        }
    }
}

struct Bridge {
    status: &'static str,
    failure: Option<String>,
    app: Option<AppHandle>,
    callers: BTreeMap<String, Caller>,
    sessions: BTreeMap<u64, Session>,
    in_flight: BTreeSet<u64>,
    next_id: u64,
}

static BRIDGE: LazyLock<Mutex<Bridge>> = LazyLock::new(|| {
    Mutex::new(Bridge {
        status: "starting",
        failure: None,
        app: None,
        callers: BTreeMap::new(),
        sessions: BTreeMap::new(),
        in_flight: BTreeSet::new(),
        next_id: 1,
    })
});

fn failed(message: String) {
    let mut bridge = BRIDGE.lock().unwrap();
    bridge.status = "failed";
    bridge.failure = Some(message);
    bridge.app = None;
    let sessions = std::mem::take(&mut bridge.sessions);
    bridge.in_flight.clear();
    drop(bridge);
    for session in sessions.into_values() {
        session.events.close();
    }
}

pub fn setup<F>(
    callback: F,
) -> impl FnOnce(&mut tauri::App) -> Result<(), Box<dyn std::error::Error>> + Send + 'static
where
    F: FnOnce(&mut tauri::App) -> Result<(), Box<dyn std::error::Error>> + Send + 'static,
{
    move |app| {
        let result = callback(app);
        if let Err(error) = &result {
            failed(error.to_string());
        }
        result
    }
}

// This is exactly Tauri's Builder::run sequence, with readiness published only
// after its original setup succeeds. There is no additional application loop.
pub fn run(
    builder: tauri::Builder<Wry>,
    context: tauri::Context<Wry>,
    policy: &str,
) -> tauri::Result<()> {
    let policy: Policy = serde_json::from_str(policy)?;
    if policy.version != 1
        || policy.callers.is_empty()
        || policy.callers.values().any(|caller| {
            caller.webview.is_empty()
                || caller.webview.contains('*')
                || caller.commands.is_empty()
                || caller
                    .commands
                    .iter()
                    .any(|command| command.is_empty() || command.contains('*'))
        })
    {
        let error = std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid native caller policy",
        );
        failed(error.to_string());
        return Err(error.into());
    }
    BRIDGE.lock().unwrap().callers = policy.callers;
    let app = builder
        .build(context)
        .inspect_err(|error| failed(error.to_string()))?;
    app.run(|app, event| match event {
        RunEvent::Ready => {
            let mut bridge = BRIDGE.lock().unwrap();
            bridge.app = Some(app.clone());
            bridge.status = "ready";
        }
        RunEvent::Exit => {
            let mut bridge = BRIDGE.lock().unwrap();
            bridge.status = "closed";
            bridge.app = None;
            let sessions = std::mem::take(&mut bridge.sessions);
            bridge.in_flight.clear();
            drop(bridge);
            for session in sessions.into_values() {
                session.events.close();
            }
        }
        _ => {}
    });
    Ok(())
}

fn error(code: &str, message: impl Into<String>) -> Value {
    json!({"ok": false, "code": code, "error": message.into()})
}

fn open(caller: &str) -> Value {
    let mut bridge = BRIDGE.lock().unwrap();
    if bridge.status != "ready" {
        return error("runtime_not_ready", bridge.status);
    }
    let Some(caller) = bridge.callers.get(caller).cloned() else {
        return error(
            "caller_denied",
            "Native caller is not declared by this artifact",
        );
    };
    if bridge.sessions.len() >= MAX_SESSIONS {
        return error("session_limit", "Too many active native sessions");
    }
    let id = bridge.next_id;
    bridge.next_id += 1;
    bridge.sessions.insert(
        id,
        Session {
            caller,
            requests: BTreeMap::new(),
            events: Default::default(),
        },
    );
    json!({"ok": true, "session": id})
}

fn finish(session: u64, id: u64, response: Value) {
    let mut bridge = BRIDGE.lock().unwrap();
    if !bridge.in_flight.remove(&id) {
        return;
    }
    if let Some(pending) = bridge
        .sessions
        .get_mut(&session)
        .and_then(|session| session.requests.get_mut(&id))
    {
        pending.response = Some(response);
    }
}

fn start(session: u64, operation: Operation) -> Value {
    let (app, caller, id) = {
        let mut bridge = BRIDGE.lock().unwrap();
        let Some(app) = bridge.app.clone() else {
            return error("runtime_not_ready", bridge.status);
        };
        let Some(active) = bridge.sessions.get(&session) else {
            return error("session_closed", "Native session is closed");
        };
        if !active.caller.commands.contains(operation.permission()) {
            return error(
                "caller_denied",
                format!("Native caller does not allow {}", operation.permission()),
            );
        }
        if active.requests.len() >= MAX_REQUESTS || bridge.in_flight.len() >= MAX_REQUESTS {
            return error("request_limit", "Too many pending native requests");
        }
        let caller = active.caller.clone();
        let id = bridge.next_id;
        bridge.next_id += 1;
        bridge
            .sessions
            .get_mut(&session)
            .unwrap()
            .requests
            .insert(id, Request::default());
        bridge.in_flight.insert(id);
        (app, caller, id)
    };
    tauri::async_runtime::spawn_blocking(move || {
        // Closing/cancelling queued work prevents dispatch. Running commands
        // retain normal Tauri side effects; only their late result is dropped.
        let active = BRIDGE
            .lock()
            .unwrap()
            .sessions
            .get(&session)
            .is_some_and(|s| s.requests.contains_key(&id));
        if !active {
            finish(
                session,
                id,
                error(
                    "request_cancelled",
                    "Native request was cancelled before dispatch",
                ),
            );
            return;
        }
        let Some(webview) = app.get_webview_window(&caller.webview) else {
            finish(
                session,
                id,
                error(
                    "webview_unavailable",
                    "Declared Tauri permission context is unavailable",
                ),
            );
            return;
        };
        let url = match webview.url() {
            Ok(url)
                if (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                    || (matches!(url.scheme(), "http" | "https")
                        && url.host_str() == Some("tauri.localhost")) =>
            {
                url
            }
            _ => {
                finish(
                    session,
                    id,
                    error(
                        "origin_denied",
                        "Native calls require the original local Tauri document",
                    ),
                );
                return;
            }
        };
        if !matches!(operation, Operation::Invoke { .. }) {
            if !events::allowed(&webview) {
                finish(
                    session,
                    id,
                    error(
                        "acl_denied",
                        "Tauri capability does not allow plugin:event|listen",
                    ),
                );
                return;
            }
            match operation {
                Operation::Listen { event } => events::listen(session, id, webview, event),
                Operation::Events => events::poll(session, id),
                Operation::Invoke { .. } => unreachable!(),
            }
            return;
        }
        let Operation::Invoke { command, payload } = operation else {
            unreachable!()
        };
        let request = InvokeRequest {
            cmd: command,
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url,
            body: InvokeBody::Json(payload),
            headers: Default::default(),
            invoke_key: app.invoke_key().to_owned(),
        };
        let dispatch = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            webview.on_message(
                request,
                Box::new(move |_, _, response, _, _| {
                    let response = match response {
                        InvokeResponse::Ok(InvokeResponseBody::Json(json))
                            if json.len() <= MAX_PAYLOAD * 8 =>
                        {
                            match serde_json::from_str::<Value>(&json) {
                                Ok(value) => json!({"ok": true, "value": value}),
                                Err(e) => error("invalid_response", e.to_string()),
                            }
                        }
                        InvokeResponse::Ok(InvokeResponseBody::Raw(bytes))
                            if bytes.len() <= MAX_PAYLOAD =>
                        {
                            json!({"ok": true, "bytes": bytes})
                        }
                        InvokeResponse::Ok(_) => error(
                            "response_too_large",
                            "Native response exceeds the bounded transport limit",
                        ),
                        InvokeResponse::Err(error) => json!({"ok": false, "error": error.0}),
                    };
                    finish(session, id, response);
                }),
            );
        }));
        if dispatch.is_err() {
            finish(
                session,
                id,
                error("command_panicked", "Tauri command panicked"),
            );
        }
    });
    json!({"ok": true, "request": id})
}

fn operate(request: Value) -> Value {
    match request["op"].as_str() {
        Some("status") => {
            let bridge = BRIDGE.lock().unwrap();
            json!({"ok": true, "status": bridge.status, "error": bridge.failure,
                "features": ["commands", "events"], "listeners": events::live_listeners()})
        }
        Some("open") => match request["caller"].as_str() {
            Some(caller) => open(caller),
            None => error("invalid_request", "caller must be a string"),
        },
        Some("submit") => match (
            request["session"].as_u64(),
            request["command"].as_str(),
            request.get("payload"),
        ) {
            (Some(session), Some(command), Some(payload)) => start(
                session,
                Operation::Invoke {
                    command: command.to_owned(),
                    payload: payload.clone(),
                },
            ),
            _ => error(
                "invalid_request",
                "submit requires session, command and payload",
            ),
        },
        Some("listen") => match (request["session"].as_u64(), request["event"].as_str()) {
            (Some(session), Some(event)) => start(
                session,
                Operation::Listen {
                    event: event.to_owned(),
                },
            ),
            _ => error("invalid_request", "listen requires session and event"),
        },
        Some("events") => match request["session"].as_u64() {
            Some(session) => start(session, Operation::Events),
            _ => error("invalid_request", "events requires session"),
        },
        Some("unlisten") => match (
            request["session"].as_u64(),
            request["subscription"].as_u64(),
        ) {
            (Some(session), Some(subscription)) => {
                json!({"ok": true, "removed": events::unlisten(session, subscription)})
            }
            _ => error(
                "invalid_request",
                "unlisten requires session and subscription",
            ),
        },
        Some("poll" | "cancel") => {
            let (Some(session), Some(id)) =
                (request["session"].as_u64(), request["request"].as_u64())
            else {
                return error("invalid_request", "session and request must be integers");
            };
            let mut bridge = BRIDGE.lock().unwrap();
            let Some(active) = bridge.sessions.get_mut(&session) else {
                return error("session_closed", "Native session is closed");
            };
            if request["op"] == "cancel" {
                let removed = active.requests.remove(&id);
                drop(bridge);
                if let Some(subscription) = removed.as_ref().and_then(|r| r.subscription) {
                    events::unlisten(session, subscription);
                }
                return json!({"ok": true, "cancelled": removed.is_some()});
            }
            match active.requests.get(&id) {
                Some(Request {
                    response: Some(_), ..
                }) => {
                    json!({"ok": true, "status": "completed", "result": active.requests.remove(&id).unwrap().response.unwrap()})
                }
                Some(_) => json!({"ok": true, "status": "pending"}),
                None => error(
                    "request_missing",
                    "Native request is retired or belongs to another session",
                ),
            }
        }
        Some("close") => match request["session"].as_u64() {
            Some(session) => {
                let removed = BRIDGE.lock().unwrap().sessions.remove(&session);
                let closed = removed.is_some();
                if let Some(session) = removed {
                    session.events.close();
                }
                json!({"ok": true, "closed": closed})
            }
            None => error("invalid_request", "session must be an integer"),
        },
        _ => error("invalid_request", "Unknown native runtime operation"),
    }
}

/// # Safety
/// Input must be a valid NUL-terminated UTF-8 string for the duration of the call.
/// Free the returned owned JSON string exactly once with the matching free function.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_runtime_request(input: *const c_char) -> *mut c_char {
    let response = std::panic::catch_unwind(|| {
        if input.is_null() {
            return error("invalid_request", "null request");
        }
        let bytes = unsafe { CStr::from_ptr(input) }.to_bytes();
        if bytes.len() > MAX_PAYLOAD {
            return error("request_too_large", "Native request exceeds 1 MiB");
        }
        match serde_json::from_slice(bytes) {
            Ok(request) => operate(request),
            Err(e) => error("invalid_request", e.to_string()),
        }
    })
    .unwrap_or_else(|_| error("runtime_panicked", "Native runtime request panicked"));
    CString::new(json!({"abiVersion": 3, "response": response}).to_string())
        .unwrap()
        .into_raw()
}

/// # Safety
/// A non-null pointer must have been returned by tauri_native_runtime_request and not already freed.
#[no_mangle]
pub unsafe extern "C" fn tauri_native_runtime_string_free(value: *mut c_char) {
    if !value.is_null() {
        drop(unsafe { CString::from_raw(value) });
    }
}
