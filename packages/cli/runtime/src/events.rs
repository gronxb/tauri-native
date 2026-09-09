use super::{error, finish, BRIDGE, MAX_PAYLOAD};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    sync::atomic::{AtomicUsize, Ordering},
};
use tauri::{EventId, Listener, Manager, WebviewWindow};

const MAX_LISTENERS: usize = 32;
const MAX_EVENTS: usize = 128;
static LIVE_LISTENERS: AtomicUsize = AtomicUsize::new(0);

// Owned by the actual Tauri callback, so diagnostics detect native handler leaks.
struct LiveListener;
impl Drop for LiveListener {
    fn drop(&mut self) {
        LIVE_LISTENERS.fetch_sub(1, Ordering::SeqCst);
    }
}

pub(super) fn live_listeners() -> usize {
    LIVE_LISTENERS.load(Ordering::SeqCst)
}

struct Subscription {
    event: String,
    attachment: Option<(WebviewWindow, EventId)>,
}

struct QueuedEvent {
    subscription: u64,
    payload: String,
}

#[derive(Default)]
pub(super) struct Events {
    subscriptions: BTreeMap<u64, Subscription>,
    queue: VecDeque<QueuedEvent>,
    bytes: usize,
    failure: Option<Value>,
}

impl Events {
    pub(super) fn close(self) {
        for subscription in self.subscriptions.into_values() {
            if let Some((webview, id)) = subscription.attachment {
                webview.unlisten(id);
            }
        }
    }

    fn push(&mut self, subscription: u64, payload: &str) {
        if !self.subscriptions.contains_key(&subscription) || self.failure.is_some() {
            return;
        }
        if self.queue.len() >= MAX_EVENTS || payload.len() > MAX_PAYLOAD - self.bytes {
            self.failure = Some(error(
                "event_overflow",
                "Event queue exceeded 128 events or 1 MiB; refetch application state",
            ));
            self.queue.clear();
            self.bytes = 0;
            return;
        }
        self.bytes += payload.len();
        self.queue.push_back(QueuedEvent {
            subscription,
            payload: payload.to_owned(),
        });
    }

    fn drain(&mut self) -> Value {
        if let Some(failure) = self.failure.take() {
            return failure;
        }
        self.bytes = 0;
        let queue = std::mem::take(&mut self.queue);
        let mut events = Vec::with_capacity(queue.len());
        for entry in queue {
            let Some(subscription) = self.subscriptions.get(&entry.subscription) else {
                continue;
            };
            let payload = match serde_json::from_str::<Value>(&entry.payload) {
                Ok(payload) => payload,
                Err(_) => {
                    return error(
                        "invalid_event_payload",
                        "Tauri event payload is not JSON; refetch application state",
                    )
                }
            };
            events.push(json!({"subscription": entry.subscription, "event": subscription.event, "payload": payload}));
        }
        json!({"ok": true, "events": events})
    }
}

pub(super) fn allowed(webview: &WebviewWindow) -> bool {
    // A WebviewWindow has the same window and webview label. Consult the live
    // original authority, including explicit denies; do not recreate its ACL.
    resolve_access(webview, webview.label())
}

fn resolve_access<R: tauri::Runtime, M: Manager<R>>(manager: &M, label: &str) -> bool {
    manager
        .manager()
        .runtime_authority
        .lock()
        .unwrap()
        .resolve_access(
            "plugin:event|listen",
            label,
            label,
            &tauri::ipc::Origin::Local,
        )
        .is_some()
}

pub(super) fn listen(session: u64, request: u64, webview: WebviewWindow, event: String) {
    // Tauri's EventName validation, bounded before calling Listener::listen,
    // which panics for invalid names. The pinned upstream permits empty names.
    if event.len() > 256
        || !event
            .chars()
            .all(|c| c.is_alphanumeric() || "-/:_".contains(c))
    {
        finish(
            session,
            request,
            error(
                "invalid_event",
                "Event names require at most 256 bytes of alphanumerics, '-', '/', ':' or '_'",
            ),
        );
        return;
    }
    let subscription = {
        let mut bridge = BRIDGE.lock().unwrap();
        let id = bridge.next_id;
        bridge.next_id += 1;
        let Some(active) = bridge.sessions.get_mut(&session) else {
            bridge.in_flight.remove(&request);
            return;
        };
        let Some(pending) = active.requests.get_mut(&request) else {
            bridge.in_flight.remove(&request);
            return;
        };
        if active.events.subscriptions.len() >= MAX_LISTENERS {
            drop(bridge);
            finish(
                session,
                request,
                error("listener_limit", "Native session already has 32 listeners"),
            );
            return;
        }
        // Install ownership before attachment so concurrent cancellation/close
        // can revoke it, and events emitted before the ack are already buffered.
        pending.subscription = Some(id);
        active.events.subscriptions.insert(
            id,
            Subscription {
                event: event.clone(),
                attachment: None,
            },
        );
        id
    };
    LIVE_LISTENERS.fetch_add(1, Ordering::SeqCst);
    let guard = LiveListener;
    let native_id = webview.listen(event, move |event| {
        let _keep_alive = &guard;
        if let Some(active) = BRIDGE.lock().unwrap().sessions.get_mut(&session) {
            active.events.push(subscription, event.payload());
        }
    });
    let attached = {
        let mut bridge = BRIDGE.lock().unwrap();
        match bridge
            .sessions
            .get_mut(&session)
            .and_then(|s| s.events.subscriptions.get_mut(&subscription))
        {
            Some(entry) => {
                entry.attachment = Some((webview.clone(), native_id));
                true
            }
            None => false,
        }
    };
    if !attached {
        webview.unlisten(native_id);
    }
    finish(
        session,
        request,
        json!({"ok": true, "subscription": subscription}),
    );
}

pub(super) fn unlisten(session: u64, subscription: u64) -> bool {
    let removed = {
        let mut bridge = BRIDGE.lock().unwrap();
        let Some(active) = bridge.sessions.get_mut(&session) else {
            return false;
        };
        let removed = active.events.subscriptions.remove(&subscription);
        active
            .events
            .queue
            .retain(|entry| entry.subscription != subscription);
        active.events.bytes = active
            .events
            .queue
            .iter()
            .map(|entry| entry.payload.len())
            .sum();
        removed
    };
    let exists = removed.is_some();
    if let Some(Subscription {
        attachment: Some((webview, id)),
        ..
    }) = removed
    {
        webview.unlisten(id);
    }
    exists
}

pub(super) fn poll(session: u64, request: u64) {
    let mut bridge = BRIDGE.lock().unwrap();
    bridge.in_flight.remove(&request);
    let Some(active) = bridge.sessions.get_mut(&session) else {
        return;
    };
    let Some(pending) = active.requests.get_mut(&request) else {
        return;
    };
    // Drain and complete atomically: cancelling a queued poll must not consume
    // events that a later active poll should receive.
    pending.response = Some(active.events.drain());
}
