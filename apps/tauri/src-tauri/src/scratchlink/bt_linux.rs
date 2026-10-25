//! Linux Bluetooth-Classic (RFCOMM/SPP) backend via BlueZ (`bluer`), for EV3 +
//! legacy-firmware SPIKE. Same ScratchLink JSON-RPC surface as the macOS shim:
//! discover{majorDeviceClass} / connect{peripheralId} / send{message} →
//! didDiscoverPeripheral / didReceiveMessage. One device at a time.

use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use bluer::{AdapterEvent, Address};
use futures_util::StreamExt;
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

use super::Outbound;

type Writer = Box<dyn AsyncWrite + Send + Unpin>;

fn writer() -> &'static Mutex<Option<Writer>> {
    static WRITER: OnceLock<Mutex<Option<Writer>>> = OnceLock::new();
    WRITER.get_or_init(|| Mutex::new(None))
}

pub async fn dispatch(txt: &str, out: &Outbound) {
    let req: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[scratchlink/bt] bad JSON: {e}");
            return;
        }
    };
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);
    log::info!("[scratchlink/bt] ◀ {method}");

    match method {
        "discover" => {
            let major = params.get("majorDeviceClass").and_then(Value::as_u64).unwrap_or(8) as u32;
            start_discover(major, out.clone());
            reply(out, id, Value::Null).await;
        }
        "connect" => {
            let Some(addr) = params.get("peripheralId").and_then(Value::as_str).map(String::from)
            else {
                reply_err(out, id, "missing peripheralId").await;
                return;
            };
            match connect(&addr, out.clone()).await {
                Ok(()) => reply(out, id, Value::Null).await,
                Err(e) => reply_err(out, id, &e).await,
            }
        }
        "send" => match decode_message(&params) {
            Ok(data) => {
                let n = data.len();
                let mut guard = writer().lock().await;
                match guard.as_mut() {
                    Some(w) => {
                        if let Err(e) = w.write_all(&data).await {
                            reply_err(out, id, &e.to_string()).await;
                            return;
                        }
                        let _ = w.flush().await;
                        reply(out, id, json!(n)).await;
                    }
                    None => reply_err(out, id, "not connected").await,
                }
            }
            Err(e) => reply_err(out, id, &e).await,
        },
        other => reply_err(out, id, &format!("unknown method: {other}")).await,
    }
}

fn start_discover(major: u32, out: Outbound) {
    tokio::spawn(async move {
        let adapter = match bluer::Session::new().await {
            Ok(s) => match s.default_adapter().await {
                Ok(a) => a,
                Err(e) => {
                    log::error!("[scratchlink/bt] adapter: {e}");
                    return;
                }
            },
            Err(e) => {
                log::error!("[scratchlink/bt] session: {e}");
                return;
            }
        };
        let _ = adapter.set_powered(true).await;
        let mut events = match adapter.discover_devices().await {
            Ok(e) => e,
            Err(e) => {
                log::error!("[scratchlink/bt] discover: {e}");
                return;
            }
        };
        let deadline = tokio::time::sleep(std::time::Duration::from_secs(15));
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                _ = &mut deadline => break,
                ev = events.next() => {
                    let Some(AdapterEvent::DeviceAdded(a)) = ev else {
                        if ev.is_none() { break; }
                        continue;
                    };
                    if let Ok(dev) = adapter.device(a) {
                        let class = dev.class().await.ok().flatten().unwrap_or(0);
                        let dev_major = (class >> 8) & 0x1f; // major device class bits
                        if major != 0 && dev_major != major {
                            continue;
                        }
                        let name = dev.name().await.ok().flatten().unwrap_or_default();
                        let rssi = dev.rssi().await.ok().flatten().unwrap_or(0);
                        let note = json!({
                            "jsonrpc": "2.0",
                            "method": "didDiscoverPeripheral",
                            "params": { "peripheralId": a.to_string(), "name": name, "rssi": rssi }
                        });
                        let _ = out.try_send(Message::Text(note.to_string()));
                    }
                }
            }
        }
    });
}

async fn connect(addr: &str, out: Outbound) -> Result<(), String> {
    let address: Address = addr.parse().map_err(|_| "invalid address".to_string())?;
    // EV3/SPP uses RFCOMM channel 1.
    let sa = bluer::rfcomm::SocketAddr::new(address, 1);
    let stream = bluer::rfcomm::Stream::connect(sa).await.map_err(|e| e.to_string())?;
    let (mut rd, wr) = tokio::io::split(stream);
    *writer().lock().await = Some(Box::new(wr));

    tokio::spawn(async move {
        let mut buf = [0u8; 1024];
        loop {
            match rd.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let note = json!({
                        "jsonrpc": "2.0",
                        "method": "didReceiveMessage",
                        "params": { "message": B64.encode(&buf[..n]), "encoding": "base64" }
                    });
                    let _ = out.try_send(Message::Text(note.to_string()));
                }
            }
        }
    });
    Ok(())
}

pub async fn cleanup() {
    *writer().lock().await = None;
}

fn decode_message(params: &Value) -> Result<Vec<u8>, String> {
    let msg = params.get("message").and_then(Value::as_str).ok_or("missing message")?;
    match params.get("encoding").and_then(Value::as_str).unwrap_or("base64") {
        "base64" => B64.decode(msg).map_err(|e| e.to_string()),
        other => Err(format!("unsupported encoding: {other}")),
    }
}

async fn reply(out: &Outbound, id: Option<Value>, result: Value) {
    if let Some(id) = id {
        let msg = json!({ "jsonrpc": "2.0", "id": id, "result": result });
        let _ = out.send(Message::Text(msg.to_string())).await;
    }
}

async fn reply_err(out: &Outbound, id: Option<Value>, message: &str) {
    if let Some(id) = id {
        let msg = json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } });
        let _ = out.send(Message::Text(msg.to_string())).await;
    }
}
