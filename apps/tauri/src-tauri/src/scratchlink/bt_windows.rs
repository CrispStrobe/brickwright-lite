//! Windows Bluetooth-Classic (RFCOMM/SPP) backend via WinRT, for EV3 + legacy
//! SPIKE. Windows only exposes RFCOMM to already-paired devices, so `discover`
//! enumerates paired SPP devices. Same ScratchLink JSON-RPC surface as macOS.
//!
//! WinRT async is COM (`IAsyncOperation` + `.get()` blocks), so all Bluetooth
//! work runs on `spawn_blocking` threads; callbacks push frames to the WS.

use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;
use windows::core::HSTRING;
use windows::Devices::Bluetooth::Rfcomm::{RfcommDeviceService, RfcommServiceId};
use windows::Devices::Enumeration::DeviceInformation;
use windows::Networking::Sockets::StreamSocket;
use windows::Storage::Streams::{DataReader, DataWriter, InputStreamOptions};

use super::Outbound;

// One connected socket at a time. StreamSocket is agile (Send + Sync).
static SOCKET: Mutex<Option<StreamSocket>> = Mutex::new(None);

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
            start_discover(out.clone());
            reply(out, id, Value::Null).await;
        }
        "connect" => {
            let Some(dev_id) = params.get("peripheralId").and_then(Value::as_str).map(String::from)
            else {
                reply_err(out, id, "missing peripheralId").await;
                return;
            };
            let out2 = out.clone();
            let res = tokio::task::spawn_blocking(move || connect_blocking(&dev_id, out2))
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
            match res {
                Ok(()) => reply(out, id, Value::Null).await,
                Err(e) => reply_err(out, id, &e).await,
            }
        }
        "send" => match decode_message(&params) {
            Ok(data) => {
                let n = data.len();
                let res = tokio::task::spawn_blocking(move || send_blocking(&data))
                    .await
                    .unwrap_or_else(|e| Err(e.to_string()));
                match res {
                    Ok(()) => reply(out, id, json!(n)).await,
                    Err(e) => reply_err(out, id, &e).await,
                }
            }
            Err(e) => reply_err(out, id, &e).await,
        },
        other => reply_err(out, id, &format!("unknown method: {other}")).await,
    }
}

fn start_discover(out: Outbound) {
    tokio::task::spawn_blocking(move || {
        if let Err(e) = discover_blocking(&out) {
            log::error!("[scratchlink/bt] discover: {e}");
        }
    });
}

fn discover_blocking(out: &Outbound) -> windows::core::Result<()> {
    // Paired devices advertising the Serial Port Profile.
    let selector = RfcommDeviceService::GetDeviceSelector(&RfcommServiceId::SerialPort()?)?;
    let devices = DeviceInformation::FindAllAsyncAqsFilter(&selector)?.get()?;
    for device in devices {
        let id = device.Id()?.to_string();
        let name = device.Name()?.to_string();
        let note = json!({
            "jsonrpc": "2.0",
            "method": "didDiscoverPeripheral",
            "params": { "peripheralId": id, "name": name, "rssi": 0 }
        });
        let _ = out.try_send(Message::Text(note.to_string()));
    }
    Ok(())
}

fn connect_blocking(dev_id: &str, out: Outbound) -> Result<(), String> {
    let service = RfcommDeviceService::FromIdAsync(&HSTRING::from(dev_id))
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;
    let socket = StreamSocket::new().map_err(|e| e.to_string())?;
    let host = service.ConnectionHostName().map_err(|e| e.to_string())?;
    let svc = service.ConnectionServiceName().map_err(|e| e.to_string())?;
    socket
        .ConnectAsync(&host, &svc)
        .and_then(|op| op.get())
        .map_err(|e| e.to_string())?;

    let reader_socket = socket.clone();
    *SOCKET.lock().unwrap() = Some(socket);

    // Blocking read loop → didReceiveMessage.
    std::thread::spawn(move || {
        let run = || -> windows::core::Result<()> {
            let input = reader_socket.InputStream()?;
            let reader = DataReader::CreateDataReader(&input)?;
            reader.SetInputStreamOptions(InputStreamOptions::Partial)?;
            loop {
                let n = reader.LoadAsync(4096)?.get()?;
                if n == 0 {
                    break;
                }
                let mut buf = vec![0u8; n as usize];
                reader.ReadBytes(&mut buf)?;
                let note = json!({
                    "jsonrpc": "2.0",
                    "method": "didReceiveMessage",
                    "params": { "message": B64.encode(&buf), "encoding": "base64" }
                });
                let _ = out.try_send(Message::Text(note.to_string()));
            }
            Ok(())
        };
        let _ = run();
    });
    Ok(())
}

fn send_blocking(data: &[u8]) -> Result<(), String> {
    let guard = SOCKET.lock().unwrap();
    let socket = guard.as_ref().ok_or("not connected")?;
    let run = || -> windows::core::Result<()> {
        let output = socket.OutputStream()?;
        let writer = DataWriter::CreateDataWriter(&output)?;
        writer.WriteBytes(data)?;
        writer.StoreAsync()?.get()?;
        writer.DetachStream()?; // don't close the socket's stream
        Ok(())
    };
    run().map_err(|e| e.to_string())
}

pub fn cleanup() {
    *SOCKET.lock().unwrap() = None;
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
