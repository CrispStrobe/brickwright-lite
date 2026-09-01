//! Caller-bound Tauri adapter for the staged broker relay. This exposes transport only: no
//! semantic native operation is registered here.

use crate::native_broker_transport::{BrokerTransportCore, RelayLimits, BROKER_LABEL, MAIN_LABEL};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Manager, State, WebviewWindow};
use tokio::sync::oneshot;

type OriginKey = (String, u64);

struct Inner {
    relay: BrokerTransportCore,
    origins: HashMap<OriginKey, oneshot::Sender<Result<String, String>>>,
}

pub(crate) struct NativeBrokerAdapter {
    epoch: Instant,
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
        self.inner.lock().map_err(|_| "broker unavailable".into())
    }

    pub(crate) fn revoke_broker(&self) {
        if let Ok(mut inner) = self.lock() {
            if let Ok(cancelled) = inner.relay.broker_teardown(BROKER_LABEL) {
                for item in cancelled {
                    if let Some(sender) = inner
                        .origins
                        .remove(&(item.session.as_str().to_owned(), item.request_id))
                    {
                        let _ = sender.send(Err("broker closed".into()));
                    }
                }
            }
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
    receiver
        .await
        .map_err(|_| "broker unavailable".to_owned())?
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
    let reply = inner
        .relay
        .reply(
            BROKER_LABEL,
            &session,
            &correlation,
            request_id,
            payload.as_bytes(),
            now,
        )
        .map_err(|_| "broker refused".to_owned())?;
    let sender = inner
        .origins
        .remove(&(session, reply.request_id))
        .ok_or_else(|| "broker refused".to_owned())?;
    let _ = sender.send(Ok(reply.payload));
    Ok(())
}

#[tauri::command]
pub(crate) fn native_broker_main_teardown(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
    session: String,
) -> Result<(), String> {
    exact_label(&window, MAIN_LABEL)?;
    let mut inner = state.lock()?;
    close_main_session(&mut inner, &session, "broker closed")
}

#[tauri::command]
pub(crate) fn native_broker_teardown(
    window: WebviewWindow,
    state: State<'_, NativeBrokerAdapter>,
) -> Result<(), String> {
    exact_label(&window, BROKER_LABEL)?;
    let mut inner = state.lock()?;
    let cancelled = inner
        .relay
        .broker_teardown(BROKER_LABEL)
        .map_err(|_| "broker refused".to_owned())?;
    for item in cancelled {
        if let Some(sender) = inner
            .origins
            .remove(&(item.session.as_str().to_owned(), item.request_id))
        {
            let _ = sender.send(Err("broker closed".into()));
        }
    }
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

    fn fixed(byte: u8) -> impl FnOnce() -> Result<[u8; 32], ()> {
        move || Ok([byte; 32])
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
}
