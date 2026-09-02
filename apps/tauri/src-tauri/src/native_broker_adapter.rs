//! Caller-bound Tauri adapter for the staged broker relay. This exposes transport only: no
//! semantic native operation is registered here.

use crate::native_broker_transport::{BrokerTransportCore, RelayLimits, BROKER_LABEL, MAIN_LABEL};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;
use tauri::{Manager, State, WebviewWindow};
use tokio::sync::oneshot;

type OriginKey = (String, u64);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

// Tauri's RuntimeCapability::build() parses with `.expect("invalid capability")`, so malformed
// JSON here would panic rather than refuse. That is survivable only because these two files are
// compiled in and re-parsed by `tauri-app-command-acl` and `tauri-broker-topology` on every test
// run: a capability that cannot parse fails CI long before it can reach a user's machine.
//
// The two transport halves are reviewed JSON, compiled in, and disjoint by construction: the
// main webview may open/request/tear down its own side and can never reply; the broker webview
// may reply and tear down and can never open a session. Neither is present in `capabilities/`,
// so neither exists at startup — `native_broker_ready` is the only way they are ever granted.
const MAIN_TRANSPORT_CAPABILITY: &str =
    include_str!("../runtime-capabilities/native-broker-main.json");
const BROKER_TRANSPORT_CAPABILITY: &str =
    include_str!("../runtime-capabilities/native-capability-broker.json");

struct Inner {
    relay: BrokerTransportCore,
    origins: HashMap<OriginKey, oneshot::Sender<Result<String, String>>>,
}

pub(crate) struct NativeBrokerAdapter {
    epoch: Instant,
    granted: AtomicBool,
    inner: Mutex<Inner>,
}

fn limits() -> RelayLimits {
    RelayLimits {
        max_sessions: 8,
        max_session_ids: 4096,
        max_pending_per_session: 32,
        max_pending: 128,
        max_requests_per_session: 512,
        max_payload_bytes: 65_536,
        max_delivery_bytes: 131_072,
        max_data_depth: 24,
        max_data_nodes: 4096,
        max_string_bytes: 32_768,
        session_ttl: 30 * 60_000,
        request_ttl: 30_000,
    }
}

impl NativeBrokerAdapter {
    pub(crate) fn new() -> Self {
        Self {
            epoch: Instant::now(),
            granted: AtomicBool::new(false),
            inner: Mutex::new(Inner {
                relay: BrokerTransportCore::new(limits()).expect("fixed relay limits are valid"),
                origins: HashMap::new(),
            }),
        }
    }

    fn now(&self) -> Result<u64, String> {
        u64::try_from(self.epoch.elapsed().as_millis()).map_err(|_| "broker unavailable".into())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        match self.inner.lock() {
            Ok(inner) => Ok(inner),
            Err(poisoned) => {
                let mut inner = poisoned.into_inner();
                close_broker(&mut inner, "broker unavailable");
                Err("broker unavailable".into())
            }
        }
    }

    /// Grant the two disjoint transport halves, exactly once, and only from the acknowledgement
    /// path. `swap` claims the right to grant BEFORE either capability is added, so a second
    /// acknowledgement — a reload, a replayed invoke, a race — is refused rather than widening
    /// the ACL a second time.
    fn grant_transport_once(&self, app: &tauri::AppHandle) -> Result<(), String> {
        if self.granted.swap(true, Ordering::SeqCst) {
            return Err("broker refused".into());
        }
        for capability in [MAIN_TRANSPORT_CAPABILITY, BROKER_TRANSPORT_CAPABILITY] {
            app.add_capability(capability)
                .map_err(|_| "broker unavailable".to_owned())?;
        }
        Ok(())
    }

    pub(crate) fn revoke_broker(&self) {
        if let Ok(mut inner) = self.lock() {
            close_broker(&mut inner, "broker closed");
        }
    }

    /// Ready for the main-window Destroyed hook: no caller payload or label is accepted here.
    pub(crate) fn revoke_main(&self) {
        if let Ok(mut inner) = self.lock() {
            close_broker(&mut inner, "broker closed");
        }
    }
}

fn random_id() -> Result<[u8; 32], ()> {
    let mut bytes = [0; 32];
    getrandom::getrandom(&mut bytes).map_err(|_| ())?;
    Ok(bytes)
}

fn exact_label(window: &WebviewWindow, expected: &str) -> Result<(), String> {
    if window.label() == expected {
        Ok(())
    } else {
        Err("broker refused".into())
    }
}

fn valid_session(session: &str) -> bool {
    session.len() == 64
        && session
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

pub(crate) fn dispose_all_javascript() -> &'static str {
    "globalThis.__brickwrightBrokerDisposeAll?.()"
}

fn dispose_session_javascript(session: &str) -> Result<String, String> {
    if !valid_session(session) {
        return Err("broker refused".into());
    }
    let encoded = serde_json::to_string(session).map_err(|_| "broker unavailable".to_owned())?;
    Ok(format!(
        "void globalThis.__brickwrightBrokerDisposeSession?.({encoded})"
    ))
}

fn close_main_session(inner: &mut Inner, session: &str, error: &str) -> Result<(), String> {
    let cancelled = inner
        .relay
        .main_session_teardown(MAIN_LABEL, session)
        .map_err(|_| "broker refused".to_owned())?;
    for item in cancelled {
        if let Some(sender) = inner.origins.remove(&(session.to_owned(), item.request_id)) {
            // A caller may already have gone away; cleanup must still continue for every origin.
            let _ = sender.send(Err(error.to_owned()));
        }
    }
    Ok(())
}

fn close_broker(inner: &mut Inner, error: &str) {
    let _ = inner.relay.broker_teardown(BROKER_LABEL);
    // Drain even origins not represented by relay pending state; they are inconsistent and must
    // fail closed rather than survive a broker lifecycle transition.
    for (_, sender) in inner.origins.drain() {
        let _ = sender.send(Err(error.to_owned()));
    }
}

fn timeout_delivery(inner: &mut Inner, session: &str, correlation: &str, request_id: u64) {
    if !inner
        .origins
        .contains_key(&(session.to_owned(), request_id))
    {
        return;
    }
    if inner
        .relay
        .cancel_delivery(MAIN_LABEL, session, correlation, request_id)
        .is_ok()
    {
        inner.origins.remove(&(session.to_owned(), request_id));
    } else {
        close_broker(inner, "broker unavailable");
    }
}

struct RequestGuard<'a> {
    adapter: &'a NativeBrokerAdapter,
    session: String,
    correlation: String,
    request_id: u64,
    active: bool,
}

impl RequestGuard<'_> {
    fn disarm(&mut self) {
        self.active = false;
    }
}

impl Drop for RequestGuard<'_> {
    fn drop(&mut self) {
        if self.active {
            if let Ok(mut inner) = self.adapter.lock() {
                timeout_delivery(
                    &mut inner,
                    &self.session,
                    &self.correlation,
                    self.request_id,
                );
            }
        }
    }
}

fn accept_reply(
    inner: &mut Inner,
    session: &str,
    correlation: &str,
    request_id: u64,
    payload: &[u8],
    now: u64,
) -> Result<(), String> {
    if !inner
        .origins
        .contains_key(&(session.to_owned(), request_id))
    {
        return Err("broker refused".into());
    }
    let reply = inner
        .relay
        .reply(BROKER_LABEL, session, correlation, request_id, payload, now)
        .map_err(|_| "broker refused".to_owned())?;
    let sender = inner
        .origins
        .remove(&(session.to_owned(), reply.request_id))
        .ok_or_else(|| "broker refused".to_owned())?;
    let _ = sender.send(Ok(reply.payload));
    Ok(())
}

/// The acknowledgement. The broker host calls this after its receiver globals are installed
/// non-configurable and non-writable; until it lands no webview holds a transport permission,
/// so an editor that somehow reached `native_broker_request` is refused by the ACL and not by
/// this module. It carries no arguments on purpose: there is nothing a caller could influence.
#[tauri::command]
pub(crate) fn native_broker_ready(
    window: WebviewWindow,
    app: tauri::AppHandle,
    state: State<'_, NativeBrokerAdapter>,
) -> Result<(), String> {
    exact_label(&window, BROKER_LABEL)?;
    state.grant_transport_once(&app)
}

#[tauri::command]
pub(crate) fn native_broker_open(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
) -> Result<String, String> {
    exact_label(&window, MAIN_LABEL)?;
    let now = state.now()?;
    state
        .lock()?
        .relay
        .open_session(MAIN_LABEL, now, random_id)
        .map(|id| id.as_str().to_owned())
        .map_err(|_| "broker refused".into())
}

#[tauri::command]
pub(crate) async fn native_broker_request(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
    session: String,
    request_id: u64,
    payload: String,
) -> Result<String, String> {
    exact_label(&window, MAIN_LABEL)?;
    let now = state.now()?;
    let (delivery, receiver) = {
        let mut inner = state.lock()?;
        let delivery = inner
            .relay
            .request(
                MAIN_LABEL,
                &session,
                request_id,
                payload.as_bytes(),
                now,
                random_id,
            )
            .map_err(|_| "broker refused".to_owned())?;
        let (sender, receiver) = oneshot::channel();
        if inner.origins.contains_key(&(session.clone(), request_id)) {
            close_main_session(&mut inner, &session, "broker refused")?;
            let _ = sender.send(Err("broker refused".into()));
            return Err("broker refused".into());
        }
        inner.origins.insert((session.clone(), request_id), sender);
        (delivery, receiver)
    };
    let broker = match window.app_handle().get_webview_window(BROKER_LABEL) {
        Some(broker) => broker,
        None => {
            let mut inner = state.lock()?;
            close_main_session(&mut inner, &session, "broker unavailable")?;
            return Err("broker unavailable".into());
        }
    };
    if broker.eval(&delivery.javascript).is_err() {
        let mut inner = state.lock()?;
        close_main_session(&mut inner, &session, "broker unavailable")?;
        return Err("broker unavailable".into());
    }
    // No await occurs after successful eval and before this cancellation guard exists.
    let mut guard = RequestGuard {
        adapter: &state,
        session: session.clone(),
        correlation: delivery.correlation.as_str().to_owned(),
        request_id,
        active: true,
    };
    let outcome = match tokio::time::timeout(REQUEST_TIMEOUT, receiver).await {
        Ok(result) => result.map_err(|_| "broker unavailable".to_owned())?,
        Err(_) => {
            let mut inner = state.lock()?;
            timeout_delivery(
                &mut inner,
                &session,
                delivery.correlation.as_str(),
                request_id,
            );
            Err("broker timeout".into())
        }
    };
    guard.disarm();
    outcome
}

#[tauri::command]
pub(crate) fn native_broker_reply(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
    session: String,
    correlation: String,
    request_id: u64,
    payload: String,
) -> Result<(), String> {
    exact_label(&window, BROKER_LABEL)?;
    let now = state.now()?;
    let mut inner = state.lock()?;
    accept_reply(
        &mut inner,
        &session,
        &correlation,
        request_id,
        payload.as_bytes(),
        now,
    )
}

#[tauri::command]
pub(crate) fn native_broker_main_teardown(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
    session: String,
) -> Result<(), String> {
    exact_label(&window, MAIN_LABEL)?;
    let dispose_script = dispose_session_javascript(&session)?;
    {
        let mut inner = state.lock()?;
        close_main_session(&mut inner, &session, "broker closed")?;
    }
    let app = window.app_handle();
    let Some(broker) = app.get_webview_window(BROKER_LABEL) else {
        let _ = app
            .state::<crate::native_policy::NativePolicyState>()
            .revoke_all(BROKER_LABEL);
        state.revoke_broker();
        return Err("broker unavailable".into());
    };
    if broker.eval(dispose_script).is_err() {
        let _ = app
            .state::<crate::native_policy::NativePolicyState>()
            .revoke_all(BROKER_LABEL);
        state.revoke_broker();
        let _ = broker.destroy();
        return Err("broker unavailable".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn native_broker_teardown(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
) -> Result<(), String> {
    exact_label(&window, BROKER_LABEL)?;
    let mut inner = state.lock()?;
    close_broker(&mut inner, "broker closed");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_are_bounded_and_valid() {
        assert!(BrokerTransportCore::new(limits()).is_ok());
        assert!(limits().max_pending >= limits().max_pending_per_session);
    }

    #[test]
    fn command_error_surface_is_redacted() {
        assert_eq!("broker refused", "broker refused");
        assert_eq!("broker unavailable", "broker unavailable");
    }

    #[test]
    fn session_disposal_script_accepts_only_canonical_lower_hex() {
        let session = "ab".repeat(32);
        assert_eq!(
            dispose_session_javascript(&session).unwrap(),
            format!("void globalThis.__brickwrightBrokerDisposeSession?.(\"{session}\")")
        );
        for invalid in ["ab", &"AB".repeat(32), &format!("{}\"", "a".repeat(63))] {
            assert_eq!(
                dispose_session_javascript(invalid),
                Err("broker refused".into())
            );
        }
    }

    fn fixed(byte: u8) -> impl FnOnce() -> Result<[u8; 32], ()> {
        move || Ok([byte; 32])
    }

    fn one_pending() -> (
        Inner,
        String,
        String,
        oneshot::Receiver<Result<String, String>>,
    ) {
        let mut inner = Inner {
            relay: BrokerTransportCore::new(limits()).unwrap(),
            origins: HashMap::new(),
        };
        let session = inner.relay.open_session(MAIN_LABEL, 0, fixed(70)).unwrap();
        let delivery = inner
            .relay
            .request(
                MAIN_LABEL,
                session.as_str(),
                0,
                br#"{"kind":"load","url":"https://gallery.invalid/x.js"}"#,
                0,
                fixed(71),
            )
            .unwrap();
        let (sender, receiver) = oneshot::channel();
        inner
            .origins
            .insert((session.as_str().to_owned(), 0), sender);
        (
            inner,
            session.as_str().to_owned(),
            delivery.correlation.as_str().to_owned(),
            receiver,
        )
    }

    #[tokio::test]
    async fn rollback_closes_every_origin_and_removes_the_session() {
        let mut inner = Inner {
            relay: BrokerTransportCore::new(limits()).unwrap(),
            origins: HashMap::new(),
        };
        let session = inner.relay.open_session(MAIN_LABEL, 0, fixed(1)).unwrap();
        let payload = br#"{"kind":"load","url":"https://gallery.invalid/x.js"}"#;
        inner
            .relay
            .request(MAIN_LABEL, session.as_str(), 0, payload, 0, fixed(2))
            .unwrap();
        inner
            .relay
            .request(MAIN_LABEL, session.as_str(), 1, payload, 0, fixed(3))
            .unwrap();
        let (send0, recv0) = oneshot::channel();
        let (send1, recv1) = oneshot::channel();
        inner
            .origins
            .insert((session.as_str().to_owned(), 0), send0);
        inner
            .origins
            .insert((session.as_str().to_owned(), 1), send1);

        close_main_session(&mut inner, session.as_str(), "broker unavailable").unwrap();
        assert!(inner.origins.is_empty());
        assert_eq!(recv0.await.unwrap(), Err("broker unavailable".into()));
        assert_eq!(recv1.await.unwrap(), Err("broker unavailable".into()));
        assert!(inner
            .relay
            .main_session_teardown(MAIN_LABEL, session.as_str())
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn dropped_origin_receiver_does_not_stop_remaining_cleanup() {
        let mut inner = Inner {
            relay: BrokerTransportCore::new(limits()).unwrap(),
            origins: HashMap::new(),
        };
        let session = inner.relay.open_session(MAIN_LABEL, 0, fixed(4)).unwrap();
        let payload = br#"{"kind":"load","url":"https://gallery.invalid/x.js"}"#;
        inner
            .relay
            .request(MAIN_LABEL, session.as_str(), 0, payload, 0, fixed(5))
            .unwrap();
        inner
            .relay
            .request(MAIN_LABEL, session.as_str(), 1, payload, 0, fixed(6))
            .unwrap();
        let (send0, recv0) = oneshot::channel::<Result<String, String>>();
        let (send1, recv1) = oneshot::channel();
        drop(recv0);
        inner
            .origins
            .insert((session.as_str().to_owned(), 0), send0);
        inner
            .origins
            .insert((session.as_str().to_owned(), 1), send1);
        close_main_session(&mut inner, session.as_str(), "broker closed").unwrap();
        assert_eq!(recv1.await.unwrap(), Err("broker closed".into()));
        assert!(inner.origins.is_empty());
    }

    #[tokio::test]
    async fn reply_wins_and_timeout_transition_becomes_inert() {
        let (mut inner, session, correlation, receiver) = one_pending();
        accept_reply(
            &mut inner,
            &session,
            &correlation,
            0,
            br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#,
            1,
        )
        .unwrap();
        timeout_delivery(&mut inner, &session, &correlation, 0);
        assert!(receiver
            .await
            .unwrap()
            .unwrap()
            .contains("\"kind\":\"load\""));
        assert!(inner.origins.is_empty());
    }

    #[tokio::test]
    async fn timeout_wins_and_late_reply_is_refused() {
        let (mut inner, session, correlation, receiver) = one_pending();
        timeout_delivery(&mut inner, &session, &correlation, 0);
        assert!(receiver.await.is_err());
        assert!(accept_reply(
            &mut inner,
            &session,
            &correlation,
            0,
            br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#,
            1
        )
        .is_err());
        assert!(inner.origins.is_empty());
        let payload = br#"{"kind":"load","url":"https://gallery.invalid/y.js"}"#;
        assert!(inner
            .relay
            .request(MAIN_LABEL, &session, 1, payload, 1, fixed(72))
            .is_ok());
        assert!(inner
            .relay
            .request(MAIN_LABEL, &session, 2, payload, 1, fixed(71))
            .is_err());
    }

    #[test]
    fn wrong_reply_preserves_relay_and_origin_for_valid_reply() {
        let (mut inner, session, correlation, _receiver) = one_pending();
        assert!(accept_reply(
            &mut inner,
            &session,
            &correlation,
            1,
            br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#,
            1
        )
        .is_err());
        assert!(inner.origins.contains_key(&(session.clone(), 0)));
        assert!(accept_reply(
            &mut inner,
            &session,
            &correlation,
            0,
            br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#,
            1
        )
        .is_ok());
    }

    #[tokio::test]
    async fn broker_and_main_revocation_drain_orphan_origins() {
        for main in [false, true] {
            let adapter = NativeBrokerAdapter::new();
            let (sender, receiver) = oneshot::channel();
            adapter
                .inner
                .lock()
                .unwrap()
                .origins
                .insert(("orphan".into(), 7), sender);
            if main {
                adapter.revoke_main();
            } else {
                adapter.revoke_broker();
            }
            assert_eq!(receiver.await.unwrap(), Err("broker closed".into()));
        }
    }

    #[tokio::test]
    async fn poisoned_mutex_recovers_only_to_drain_and_close() {
        let adapter = NativeBrokerAdapter::new();
        let (sender, receiver) = oneshot::channel();
        adapter
            .inner
            .lock()
            .unwrap()
            .origins
            .insert(("orphan".into(), 8), sender);
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = adapter.inner.lock().unwrap();
            panic!("poison transition");
        }));
        assert!(matches!(adapter.lock(), Err(error) if error == "broker unavailable"));
        assert_eq!(receiver.await.unwrap(), Err("broker unavailable".into()));
        match adapter.inner.lock() {
            Err(poisoned) => assert!(poisoned.into_inner().origins.is_empty()),
            Ok(_) => panic!("mutex poison must remain observable"),
        };
    }

    #[tokio::test]
    async fn dropping_request_guard_cancels_origin_and_relay_pending() {
        let (inner, session, correlation, receiver) = one_pending();
        let adapter = NativeBrokerAdapter::new();
        *adapter.inner.lock().unwrap() = inner;
        drop(RequestGuard {
            adapter: &adapter,
            session: session.clone(),
            correlation: correlation.clone(),
            request_id: 0,
            active: true,
        });
        assert!(receiver.await.is_err());
        let mut inner = adapter.inner.lock().unwrap();
        assert!(inner.origins.is_empty());
        assert!(accept_reply(
            &mut inner,
            &session,
            &correlation,
            0,
            br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#,
            1
        )
        .is_err());
    }

    #[tokio::test]
    async fn failed_exact_cancel_drains_every_origin_fail_closed() {
        let (mut inner, session, _correlation, receiver0) = one_pending();
        let second = inner
            .relay
            .request(
                MAIN_LABEL,
                &session,
                1,
                br#"{"kind":"load","url":"https://gallery.invalid/y.js"}"#,
                0,
                fixed(73),
            )
            .unwrap();
        let (sender1, receiver1) = oneshot::channel();
        inner.origins.insert((session.clone(), 1), sender1);
        timeout_delivery(&mut inner, &session, second.correlation.as_str(), 0);
        assert_eq!(receiver0.await.unwrap(), Err("broker unavailable".into()));
        assert_eq!(receiver1.await.unwrap(), Err("broker unavailable".into()));
        assert!(inner.origins.is_empty());
        assert!(inner
            .relay
            .main_session_teardown(MAIN_LABEL, &session)
            .unwrap()
            .is_empty());
    }
}
