//! The Scratch-Link route WITHOUT a socket — the third way in.
//!
//! The extensions deliberately offer three connection paths (Web Bluetooth
//! direct, Scratch Link, and a user-run bridge) so that a transport failing on
//! one platform does not take the hardware with it. That only pays off if each
//! path can actually stand on its own, and the Scratch Link path stood on a
//! localhost WebSocket: `ws://127.0.0.1:20111`.
//!
//! A localhost WebSocket is not always available to a webview. CodePM and Scrub
//! — both of which drive real LEGO hardware from iOS today — cannot use one at
//! all: they load `https://scratch.mit.edu`, and WebKit blocks `ws://` from an
//! HTTPS origin as mixed content. Their answer is to replace the page's
//! `WebSocket` constructor and carry the SAME JSON-RPC over a native message
//! channel. This is that channel, for our app.
//!
//! Nothing here re-implements the protocol. `ble::dispatch` is already
//! transport-agnostic — it takes a frame and an `Outbound` sink — so the bridge
//! supplies a sink that emits Tauri events instead of writing WebSocket frames.
//! One implementation, two ways in; a divergence between them is impossible
//! rather than merely unlikely.
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use super::{ble, bt_dispatch, Outbound};

/// The event the web side listens on. One event per outbound frame, payload is
/// the JSON-RPC text exactly as the WebSocket route would have sent it.
const EVENT: &str = "scratchlink://message";

/// The open bridge session: its outbound sink and WHICH transport it speaks.
///
/// The transport is not decoration. The socket route picks `ble` or `bt` from
/// the request path (`/scratch/ble` vs `/scratch/bt`) and they are different
/// backends entirely — BLE is btleplug/CoreBluetooth, BT is RFCOMM/MFi. A
/// bridge that sent everything to `ble::dispatch` would work for the BLE hubs
/// and silently break EV3 and NXT, which are exactly the devices that have no
/// other route on iOS.
#[derive(Clone)]
struct BridgeSession {
    out: Outbound,
    transport: Transport,
    ble: Arc<ble::SessionState>,
}

#[derive(Default)]
pub struct BridgeState(Mutex<Option<BridgeSession>>);

/// Which backend a bridge session talks to. Mirrors the socket route's own
/// path-based choice rather than inventing a second vocabulary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum Transport {
    #[default]
    Ble,
    Bt,
}

/// Open the bridge and start pumping outbound frames to the webview.
/// Open the bridge for one transport. `kind` is "ble" or "bt" — the same
/// choice the socket route makes from the URL path.
#[tauri::command]
pub fn scratchlink_bridge_open(
    app: AppHandle,
    state: State<BridgeState>,
    kind: Option<String>,
) -> Result<(), String> {
    let transport = match kind.as_deref().unwrap_or("ble") {
        "bt" => Transport::Bt,
        "ble" => Transport::Ble,
        other => return Err(format!("unknown scratchlink transport: {other}")),
    };
    let (tx, mut rx) = mpsc::channel::<Message>(64);
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            // Only text frames carry JSON-RPC; anything else is not ours to
            // forward, and silently dropping it is correct rather than lossy.
            if let Message::Text(txt) = msg {
                let _ = app.emit(EVENT, txt.to_string());
            }
        }
    });
    *state.0.lock().map_err(|e| e.to_string())? = Some(BridgeSession {
        out: tx,
        transport,
        ble: Arc::new(ble::SessionState::default()),
    });
    log::info!("[scratchlink/bridge] open ({transport:?})");
    Ok(())
}

/// Hand one JSON-RPC frame to the same dispatcher the socket route uses.
#[tauri::command]
pub async fn scratchlink_bridge_send(
    state: State<'_, BridgeState>,
    frame: String,
) -> Result<(), String> {
    // Clone the sender out of the lock before awaiting: a std::sync::MutexGuard
    // held across an await is not Send, and this command is async because
    // dispatch is.
    let session = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    let Some(session) = session else {
        return Err("the Scratch Link bridge is not open".into());
    };
    match session.transport {
        Transport::Ble => ble::dispatch(&frame, &session.out, &session.ble).await,
        Transport::Bt => bt_dispatch(&frame, &session.out).await,
    }
    Ok(())
}

/// Close the bridge and release the adapter, as a socket close would.
#[tauri::command]
pub async fn scratchlink_bridge_close(state: State<'_, BridgeState>) -> Result<(), String> {
    let was = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    // Only the BLE backend keeps global state to release; the BT backends own
    // their connection per dispatch. Calling ble::cleanup() after a BT session
    // would drop a BLE hub the user still has connected.
    if was
        .as_ref()
        .map_or(true, |session| session.transport == Transport::Ble)
    {
        ble::cleanup().await;
    }
    log::info!("[scratchlink/bridge] closed");
    Ok(())
}
