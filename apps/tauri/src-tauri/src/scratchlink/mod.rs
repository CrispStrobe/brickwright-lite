//! Local ScratchLink WebSocket server.
//!
//! The Brickwright web VM (scratch-vm `io/bt.js` and `io/ble.js`) connects to a
//! local Scratch-Link at `ws://127.0.0.1:20111/scratch/{bt,ble}` and speaks a
//! small JSON-RPC dialect. Because the web build already dials this URL, an
//! unmodified web bundle "just works" once this server is up — no per-platform
//! inject script on desktop.
//!
//!   BLE (`ble` module) → wired to `tauri-plugin-blec` (btleplug): covers all
//!        modern LEGO (SPIKE FW3.x, Essential, Boost, Powered-Up, WeDo, Technic,
//!        DUPLO, Mario).
//!   BTC (skeleton below) → EV3 + legacy-firmware SPIKE. Backends still TODO:
//!        WinRT / BlueZ-bluer / Android-JNI (via `bluetooth-rust`), a macOS
//!        IOBluetooth objc2 shim, and iOS ExternalAccessory.

mod ble;
#[cfg(target_os = "macos")]
mod bt_macos;
#[cfg(target_os = "linux")]
mod bt_linux;
#[cfg(target_os = "windows")]
mod bt_windows;
#[cfg(target_os = "android")]
mod bt_android;
#[cfg(target_os = "ios")]
mod bt_ios;

use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
// Used by the non-macOS BT skeleton and the tests; on macOS BT goes through
// bt_macos, leaving these otherwise unused.
#[allow(unused_imports)]
use serde_json::{json, Value};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;

pub const SCRATCH_LINK_ADDR: &str = "127.0.0.1:20111";

/// Outbound sink to a connected web client: frames queued here are written to
/// the WebSocket. Clonable so async tasks and sync blec callbacks can push
/// responses and notifications back independently of the read loop.
pub type Outbound = mpsc::Sender<Message>;

/// Spawn the ScratchLink server on the Tauri async runtime. Non-blocking.
pub fn start() {
    tauri::async_runtime::spawn(async {
        if let Err(e) = serve().await {
            log::error!("[scratchlink] server exited: {e}");
        }
    });
}

async fn serve() -> std::io::Result<()> {
    let listener = TcpListener::bind(SCRATCH_LINK_ADDR).await?;
    log::info!("[scratchlink] listening on ws://{SCRATCH_LINK_ADDR}/scratch/{{bt,ble}}");
    serve_on(listener).await
}

/// Accept loop over an already-bound listener. Split out so integration tests
/// can drive the server on an ephemeral port.
async fn serve_on(listener: TcpListener) -> std::io::Result<()> {
    loop {
        let (stream, peer) = listener.accept().await?;
        tokio::spawn(async move {
            if let Err(e) = handle_conn(stream).await {
                log::warn!("[scratchlink] connection {peer} closed: {e}");
            }
        });
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Transport {
    Bt,
    Ble,
    Unknown,
}

// The handshake callback's Err type (`http::Response`) is fixed by tungstenite's
// API, so we can't shrink it — allow the large-err lint for this fn.
#[allow(clippy::result_large_err)]
async fn handle_conn(stream: TcpStream) -> Result<(), tokio_tungstenite::tungstenite::Error> {
    // Capture the request path during the handshake to route bt vs ble.
    let path_slot: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let path_capture = Arc::clone(&path_slot);
    let ws = tokio_tungstenite::accept_hdr_async(stream, move |req: &Request, res: Response| {
        *path_capture.lock().unwrap() = req.uri().path().to_string();
        Ok(res)
    })
    .await?;

    let transport = match path_slot.lock().unwrap().as_str() {
        p if p.ends_with("/bt") => Transport::Bt,
        p if p.ends_with("/ble") => Transport::Ble,
        _ => Transport::Unknown,
    };
    log::info!("[scratchlink] client connected ({transport:?})");

    let (mut ws_write, mut ws_read) = ws.split();

    // Single writer task owns the sink; everything else sends via `out`.
    let (out, mut out_rx) = mpsc::channel::<Message>(64);
    let writer = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if ws_write.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(msg) = ws_read.next().await {
        match msg? {
            Message::Text(txt) => match transport {
                Transport::Ble => ble::dispatch(&txt, &out).await,
                Transport::Bt => bt_dispatch(&txt, &out).await,
                Transport::Unknown => log::warn!("[scratchlink] frame on unknown path: {txt}"),
            },
            Message::Ping(p) => {
                let _ = out.send(Message::Pong(p)).await;
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    if transport == Transport::Ble {
        ble::cleanup().await;
    }
    #[cfg(target_os = "macos")]
    if transport == Transport::Bt {
        bt_macos::cleanup();
    }
    #[cfg(target_os = "linux")]
    if transport == Transport::Bt {
        bt_linux::cleanup().await;
    }
    #[cfg(target_os = "windows")]
    if transport == Transport::Bt {
        bt_windows::cleanup();
    }
    #[cfg(target_os = "android")]
    if transport == Transport::Bt {
        bt_android::cleanup();
    }
    #[cfg(target_os = "ios")]
    if transport == Transport::Bt {
        bt_ios::cleanup();
    }
    writer.abort();
    log::info!("[scratchlink] client disconnected ({transport:?})");
    Ok(())
}

/// BTC/SPP dispatch. macOS has a real IOBluetooth RFCOMM backend (EV3 + legacy
/// SPIKE); other platforms still route-and-ACK, pending `bluetooth-rust`
/// (Win/Linux/Android) and the iOS ExternalAccessory plugin.
#[cfg(target_os = "macos")]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    bt_macos::dispatch(txt, out).await;
}

#[cfg(target_os = "linux")]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    bt_linux::dispatch(txt, out).await;
}

#[cfg(target_os = "windows")]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    bt_windows::dispatch(txt, out).await;
}

#[cfg(target_os = "android")]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    bt_android::dispatch(txt, out).await;
}

#[cfg(target_os = "ios")]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    bt_ios::dispatch(txt, out).await;
}

#[cfg(not(any(
    target_os = "macos",
    target_os = "linux",
    target_os = "windows",
    target_os = "android",
    target_os = "ios"
)))]
async fn bt_dispatch(txt: &str, out: &Outbound) {
    let req: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[scratchlink/bt] bad JSON: {e}");
            return;
        }
    };
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    log::info!("[scratchlink/bt] ◀ {method} (skeleton — RFCOMM backend TODO)");
    if let Some(id) = req.get("id").cloned() {
        let reply = json!({ "jsonrpc": "2.0", "id": id, "result": Value::Null });
        let _ = out.send(Message::Text(reply.to_string())).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::connect_async;

    async fn spawn() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let _ = serve_on(listener).await;
        });
        port
    }

    async fn roundtrip(path: &str, request: &str) -> Value {
        let port = spawn().await;
        let (mut ws, _) = connect_async(format!("ws://127.0.0.1:{port}{path}"))
            .await
            .unwrap();
        ws.send(Message::Text(request.to_string())).await.unwrap();
        let msg = ws.next().await.unwrap().unwrap();
        serde_json::from_str(msg.to_text().unwrap()).unwrap()
    }

    #[tokio::test]
    async fn ble_ping_returns_42() {
        let v = roundtrip("/scratch/ble", r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#).await;
        assert_eq!(v["id"], 1);
        assert_eq!(v["result"], 42);
    }

    #[tokio::test]
    async fn bt_skeleton_acks_requests() {
        let v = roundtrip(
            "/scratch/bt",
            r#"{"jsonrpc":"2.0","id":5,"method":"discover","params":{}}"#,
        )
        .await;
        assert_eq!(v["id"], 5);
        assert!(v.get("result").is_some());
    }

    #[tokio::test]
    async fn ble_without_handler_errors_gracefully() {
        // No Tauri plugin is initialized in unit tests, so get_handler() fails.
        // The bridge must return a JSON-RPC error rather than panicking.
        let v = roundtrip(
            "/scratch/ble",
            r#"{"jsonrpc":"2.0","id":9,"method":"connect","params":{"peripheralId":"x"}}"#,
        )
        .await;
        assert_eq!(v["id"], 9);
        assert!(v.get("error").is_some());
    }

    #[tokio::test]
    async fn unknown_ble_method_errors() {
        let v = roundtrip("/scratch/ble", r#"{"jsonrpc":"2.0","id":2,"method":"bogus"}"#).await;
        assert_eq!(v["id"], 2);
        assert!(v.get("error").is_some());
    }
}
