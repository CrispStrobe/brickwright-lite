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
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use super::{ble, Outbound};

/// The event the web side listens on. One event per outbound frame, payload is
/// the JSON-RPC text exactly as the WebSocket route would have sent it.
const EVENT: &str = "scratchlink://message";

/// The open bridge session, if any. A single session matches the WebSocket
/// route, where one client owns the BLE adapter at a time.
#[derive(Default)]
pub struct BridgeState(pub Mutex<Option<Outbound>>);

/// Open the bridge and start pumping outbound frames to the webview.
#[tauri::command]
pub fn scratchlink_bridge_open(app: AppHandle, state: State<BridgeState>) -> Result<(), String> {
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
    *state.0.lock().map_err(|e| e.to_string())? = Some(tx);
    log::info!("[scratchlink/bridge] open");
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
    let out = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };
    let Some(out) = out else {
        return Err("the Scratch Link bridge is not open".into());
    };
    ble::dispatch(&frame, &out).await;
    Ok(())
}

/// Close the bridge and release the adapter, as a socket close would.
#[tauri::command]
pub async fn scratchlink_bridge_close(state: State<'_, BridgeState>) -> Result<(), String> {
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    ble::cleanup().await;
    log::info!("[scratchlink/bridge] closed");
    Ok(())
}
