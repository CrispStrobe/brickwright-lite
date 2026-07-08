//! Local ScratchLink WebSocket server.
//!
//! The Brickwright web VM (scratch-vm `io/bt.js` and `io/ble.js`) connects to a
//! local Scratch-Link at `ws://127.0.0.1:20111/scratch/{bt,ble}` and speaks a
//! small JSON-RPC dialect:
//!   BT  : discover{majorDeviceClass,minorDeviceClass} → connect{peripheralId}
//!         → send{message,encoding:"base64"}; inbound didReceiveMessage.
//!   BLE : discover → connect → write/read/startNotifications (GATT).
//!
//! Because the web build already dials this URL, an unmodified web bundle "just
//! works" once this server is up — no per-platform inject script on desktop.
//!
//! This is the SKELETON: it binds the port, completes the WS handshake, routes
//! by path, and logs the JSON-RPC frames. The real transports get wired in next:
//!   - BLE  → `tauri-plugin-blec` (btleplug) on all platforms.
//!   - BTC  → per-platform (WinRT / BlueZ-bluer / Android-JNI via `bluetooth-rust`,
//!            macOS via an IOBluetooth objc2 shim, iOS via ExternalAccessory).

use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::Message;

pub const SCRATCH_LINK_ADDR: &str = "127.0.0.1:20111";

/// Spawn the ScratchLink server on the Tauri async runtime. Non-blocking;
/// returns immediately. Errors are logged, never fatal to the app.
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
    loop {
        let (stream, peer) = listener.accept().await?;
        tokio::spawn(async move {
            if let Err(e) = handle_conn(stream).await {
                log::warn!("[scratchlink] connection {peer} closed: {e}");
            }
        });
    }
}

#[derive(Clone, Copy, Debug)]
enum Transport {
    Bt,
    Ble,
    Unknown,
}

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

    let (mut write, mut read) = ws.split();
    log::info!("[scratchlink] client connected ({transport:?})");

    while let Some(msg) = read.next().await {
        match msg? {
            Message::Text(txt) => {
                log::info!("[scratchlink] ◀ {txt}");
                // Skeleton: acknowledge JSON-RPC requests that carry an `id` so
                // the client's promise resolves instead of timing out.
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                    if let Some(id) = v.get("id") {
                        let reply = serde_json::json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": serde_json::Value::Null
                        });
                        write.send(Message::Text(reply.to_string())).await?;
                    }
                }
            }
            Message::Binary(b) => log::info!("[scratchlink] ◀ {} bytes (binary)", b.len()),
            Message::Close(_) => break,
            Message::Ping(p) => write.send(Message::Pong(p)).await?,
            _ => {}
        }
    }
    log::info!("[scratchlink] client disconnected");
    Ok(())
}
