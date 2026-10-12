//! Peer sessions: opt-in LAN sharing between two Brickwright apps (task E11).
//!
//! COMPILED ONLY WITH THE `peers` CARGO FEATURE, which is not a default feature: a default
//! build has no listener, no peer command and no peer capability. The security review is
//! docs/PEERS-SECURITY-REVIEW.md; each `F<n>` below names the finding a line answers.
//!
//! A share link carries a 256-bit secret. Every request is authenticated before the receiver
//! reads it (protocol.rs), and before anything reaches the editor the RECEIVING PERSON agrees
//! in a NATIVE dialog (F1, F2, F3): script in the editor can neither click it nor replace it,
//! unlike `window.confirm`, which the dialog plugin turns into an always-truthy Promise (E6).

pub mod protocol;

use protocol::{Consent, PORT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Semaphore};

const MAIN: &str = "main";
/// An unauthenticated connection gets this long to prove it holds the secret (F5).
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
/// Room for a person to answer the consent dialog, then for the editor to act.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(90);
const IO_TIMEOUT: Duration = Duration::from_secs(100);
const PENDING_HANDSHAKES: usize = 8;
const PENDING_REQUESTS: usize = 4;

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum ControlConsent {
    #[default]
    Unasked,
    Allowed,
    Refused,
}

#[derive(Default)]
struct Inner {
    secret: Option<[u8; 32]>,
    listener: Option<tauri::async_runtime::JoinHandle<()>>,
    starting: bool,
    generation: u64,
    next_id: u64,
    control: ControlConsent,
    pending: HashMap<u64, oneshot::Sender<Result<Value, String>>>,
}

#[derive(Clone, Default)]
pub struct PeerState {
    inner: Arc<Mutex<Inner>>,
    /// One consent dialog at a time, so a paired peer cannot stack dialogs (F7).
    asking: Arc<tokio::sync::Mutex<()>>,
}

impl PeerState {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        self.inner.lock().map_err(|_| "Peer service unavailable".to_owned())
    }
}

#[derive(Serialize)]
pub struct PeerStatus {
    enabled: bool,
    links: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct WireRequest {
    version: u8,
    action: String,
    payload: Value,
}

#[derive(Serialize, Deserialize)]
struct WireReply {
    ok: bool,
    payload: Option<Value>,
    error: Option<String>,
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == MAIN {
        Ok(())
    } else {
        Err("Peer command refused".into())
    }
}

/// The address other devices reach this one at: the interface the default route leaves by,
/// and only when it is a private address (the WIP's `get_if_addrs` dependency is gone, F10).
fn local_address() -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:9").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if ip.is_private() => Some(ip),
        _ => None,
    }
}

fn status(inner: &Inner) -> PeerStatus {
    PeerStatus {
        enabled: inner.secret.is_some(),
        links: match (inner.secret.as_ref(), local_address()) {
            (Some(secret), Some(ip)) => vec![protocol::link_for(ip, secret)],
            _ => Vec::new(),
        },
    }
}

/// A native OK/Cancel box, off the IPC thread. Script in the webview cannot answer it.
async fn ask(app: &tauri::AppHandle, message: String) -> bool {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Peer sessions")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Allow".into(), "Deny".into()))
            .blocking_show()
    })
    .await
    .unwrap_or(false)
}

/// Text a peer chose, made safe to show in a dialog: no control characters, bounded length.
fn shown(value: Option<&Value>) -> String {
    let text: String = value
        .and_then(Value::as_str)
        .unwrap_or("")
        .chars()
        .filter(|c| !c.is_control())
        .take(80)
        .collect();
    if text.trim().is_empty() {
        "an untitled project".into()
    } else {
        format!("“{}”", text.trim())
    }
}

fn request_question(action: &str, payload: &Value) -> String {
    match action {
        "camera.capture" => "A paired device asks to take a photo with this device's camera now. \
            Allow it to take one photo?"
            .into(),
        "project.offer" => format!(
            "A paired device sends the project {}. Open it? It replaces the current project.",
            shown(payload.get("name"))
        ),
        "project.request" => "A paired device asks for a copy of the open project and its \
            Code tab. Send it?"
            .into(),
        "code.offer" => "A paired device sends code for the Code tab. Open it there? \
            It replaces the Code tab's contents."
            .into(),
        "code.request" => "A paired device asks for a copy of the Code tab. Send it?".into(),
        _ => "A paired device asks for something this app does not know.".into(),
    }
}

const CONTROL_QUESTION: &str = "A paired device asks to control the open project: start it, \
    send broadcasts, read and change stage variables and move sprites. A running project can \
    drive connected robots and motors. Allow this until sharing stops?";

/// The consent the receiving person gives before `action` reaches the editor (F1, F2, F3).
async fn consent(
    app: &tauri::AppHandle,
    state: &PeerState,
    consent: Consent,
    action: &str,
    payload: &Value,
) -> Result<(), String> {
    match consent {
        Consent::None => Ok(()),
        Consent::EachRequest => {
            let _turn = state.asking.lock().await;
            if ask(app, request_question(action, payload)).await {
                Ok(())
            } else {
                Err("Declined on the receiving device".into())
            }
        }
        Consent::Control => {
            let _turn = state.asking.lock().await;
            match state.lock()?.control {
                ControlConsent::Allowed => return Ok(()),
                ControlConsent::Refused => {
                    return Err("Remote control was declined on the receiving device".into())
                }
                ControlConsent::Unasked => {}
            }
            let allowed = ask(app, CONTROL_QUESTION.into()).await;
            state.lock()?.control = if allowed {
                ControlConsent::Allowed
            } else {
                ControlConsent::Refused
            };
            if allowed {
                Ok(())
            } else {
                Err("Remote control was declined on the receiving device".into())
            }
        }
    }
}

#[tauri::command]
pub fn peer_status(window: WebviewWindow, state: State<'_, PeerState>) -> Result<PeerStatus, String> {
    main_only(&window)?;
    let inner = state.lock()?;
    Ok(status(&inner))
}

/// Start sharing. The person confirms in a native dialog, so a script in the editor (a
/// loaded extension, say) cannot open a LAN listener and read its link on its own (F8).
#[tauri::command]
pub async fn peer_enable(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, PeerState>,
) -> Result<PeerStatus, String> {
    main_only(&window)?;
    let peer_state = state.inner().clone();
    if peer_state.lock()?.secret.is_none()
        && !ask(
            &app,
            "Start peer sharing? Anyone on this network who gets the link can ask this device \
             for photos and projects, and ask to control the open project. You will be asked \
             before each of those happens. Sharing stops when you stop it or quit."
                .into(),
        )
        .await
    {
        return Err("Peer sharing was not started".into());
    }
    let (needs_start, generation) = {
        let mut inner = peer_state.lock()?;
        if inner.starting {
            return Err("Peer service is starting; try again".into());
        }
        let needs_start = inner.listener.is_none();
        inner.starting = needs_start;
        (needs_start, inner.generation)
    };
    if needs_start {
        let started = start(app, peer_state.clone()).await;
        let mut inner = peer_state.lock()?;
        inner.starting = false;
        if inner.generation != generation {
            if let Ok(listener) = started {
                listener.abort();
            }
            return Err("Peer sharing was stopped while starting".into());
        }
        inner.listener = Some(started?);
    }
    let mut inner = peer_state.lock()?;
    if inner.secret.is_none() {
        inner.secret = Some(protocol::random32()?);
        inner.control = ControlConsent::Unasked;
    }
    Ok(status(&inner))
}

/// Stop sharing: close the listener, forget the secret (every link dies), drop the control
/// consent and fail every request still waiting.
#[tauri::command]
pub fn peer_disable(window: WebviewWindow, state: State<'_, PeerState>) -> Result<(), String> {
    main_only(&window)?;
    let mut inner = state.lock()?;
    inner.secret = None;
    inner.control = ControlConsent::Unasked;
    inner.generation = inner.generation.wrapping_add(1);
    if let Some(listener) = inner.listener.take() {
        listener.abort();
    }
    for (_, sender) in inner.pending.drain() {
        let _ = sender.send(Err("Peer sharing stopped".into()));
    }
    Ok(())
}

#[tauri::command]
pub fn peer_reply(
    window: WebviewWindow,
    state: State<'_, PeerState>,
    id: u64,
    payload: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    main_only(&window)?;
    let sender = state
        .lock()?
        .pending
        .remove(&id)
        .ok_or("Peer request expired")?;
    let result = match error {
        Some(message) => Err(message.chars().take(500).collect()),
        None => Ok(payload.unwrap_or(Value::Null)),
    };
    let _ = sender.send(result);
    Ok(())
}

#[tauri::command]
pub async fn peer_send(
    window: WebviewWindow,
    link: String,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    main_only(&window)?;
    protocol::consent_for(&action).ok_or("Unknown peer action")?;
    let (address, secret) = protocol::parse_link(&link)?;
    let bytes = serde_json::to_vec(&WireRequest {
        version: 2,
        action,
        payload,
    })
    .map_err(|_| "Invalid peer request")?;
    tokio::time::timeout(IO_TIMEOUT, async move {
        let mut stream = TcpStream::connect(address).await.map_err(|e| e.to_string())?;
        let mut channel = protocol::client_handshake(&mut stream, &secret).await?;
        protocol::write_frame(&mut stream, &mut channel.send, b"request", &bytes).await?;
        let response = protocol::read_frame(&mut stream, &mut channel.recv, b"response").await?;
        let reply: WireReply =
            serde_json::from_slice(&response).map_err(|_| "Invalid peer reply")?;
        if reply.ok {
            Ok(reply.payload.unwrap_or(Value::Null))
        } else {
            Err(reply.error.unwrap_or_else(|| "Peer request failed".into()))
        }
    })
    .await
    .map_err(|_| "Peer request timed out".to_owned())?
}

async fn start(
    app: tauri::AppHandle,
    state: PeerState,
) -> Result<tauri::async_runtime::JoinHandle<()>, String> {
    // IPv4 on every interface, but a connection from outside the local network is closed
    // before a byte is read (F9); the link only ever names a private address.
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, PORT))
        .await
        .map_err(|e| format!("Peer service could not listen: {e}"))?;
    Ok(tauri::async_runtime::spawn(async move {
        let handshakes = Arc::new(Semaphore::new(PENDING_HANDSHAKES));
        let requests = Arc::new(Semaphore::new(PENDING_REQUESTS));
        loop {
            let (stream, remote) = match listener.accept().await {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("peer accept failed: {error}");
                    continue;
                }
            };
            if !protocol::address_allowed(remote.ip()) {
                continue;
            }
            let Ok(handshake) = handshakes.clone().try_acquire_owned() else {
                continue;
            };
            let app = app.clone();
            let state = state.clone();
            let requests = requests.clone();
            tauri::async_runtime::spawn(async move {
                let _ = serve_one(stream, app, state, handshake, requests).await;
            });
        }
    }))
}

async fn serve_one(
    mut stream: TcpStream,
    app: tauri::AppHandle,
    state: PeerState,
    handshake: tokio::sync::OwnedSemaphorePermit,
    requests: Arc<Semaphore>,
) -> Result<(), String> {
    let secret = state.lock()?.secret.ok_or("Peer sharing is off")?;
    let mut channel = tokio::time::timeout(
        HANDSHAKE_TIMEOUT,
        protocol::server_handshake(&mut stream, &secret),
    )
    .await
    .map_err(|_| "Peer handshake timed out".to_owned())??;
    drop(handshake);
    let _request_slot = requests.try_acquire_owned().map_err(|_| "Peer is busy")?;
    tokio::time::timeout(IO_TIMEOUT, async {
        let clear = protocol::read_frame(&mut stream, &mut channel.recv, b"request").await?;
        let request: WireRequest =
            serde_json::from_slice(&clear).map_err(|_| "Invalid peer request")?;
        let reply = match handle(&app, &state, &secret, request).await {
            Ok(payload) => WireReply { ok: true, payload: Some(payload), error: None },
            Err(error) => WireReply { ok: false, payload: None, error: Some(error) },
        };
        let bytes = serde_json::to_vec(&reply).map_err(|_| "Invalid peer reply")?;
        protocol::write_frame(&mut stream, &mut channel.send, b"response", &bytes).await
    })
    .await
    .map_err(|_| "Peer request timed out".to_owned())?
}

async fn handle(
    app: &tauri::AppHandle,
    state: &PeerState,
    secret: &[u8; 32],
    request: WireRequest,
) -> Result<Value, String> {
    if request.version != 2 {
        return Err("Unsupported peer protocol".into());
    }
    let needed = protocol::consent_for(&request.action).ok_or("Unknown peer action")?;
    consent(app, state, needed, &request.action, &request.payload).await?;
    // Revocation while the handshake or the dialog was open invalidates this request too.
    let (id, receiver) = {
        let mut inner = state.lock()?;
        if inner.secret != Some(*secret) {
            return Err("Peer sharing stopped".into());
        }
        inner.next_id = inner.next_id.wrapping_add(1);
        let id = inner.next_id;
        let (sender, receiver) = oneshot::channel();
        inner.pending.insert(id, sender);
        (id, receiver)
    };
    let event = serde_json::json!({
        "id": id, "action": request.action, "payload": request.payload
    });
    if app.emit_to(MAIN, "bw-peer-request", event).is_err() {
        state.lock()?.pending.remove(&id);
        return Err("Peer application unavailable".into());
    }
    let result = tokio::time::timeout(REQUEST_TIMEOUT, receiver).await;
    state.lock()?.pending.remove(&id);
    match result {
        Ok(Ok(outcome)) => outcome,
        _ => Err("Peer request timed out".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_peer_chosen_name_cannot_spoof_the_dialog() {
        let name = Value::String("Robot\n\nOK to everything\u{202e}".into());
        let text = request_question("project.offer", &serde_json::json!({"name": name}));
        assert!(!text.contains('\n') && !text.contains('\u{202e}'), "{text}");
        let long = Value::String("x".repeat(500));
        assert!(shown(Some(&long)).chars().count() <= 82);
        assert_eq!(shown(None), "an untitled project");
    }

    #[test]
    fn every_consented_action_has_its_own_question() {
        for (action, needed) in protocol::ACTIONS {
            if *needed == Consent::EachRequest {
                assert!(!request_question(action, &Value::Null).contains("does not know"), "{action}");
            }
        }
    }
}
