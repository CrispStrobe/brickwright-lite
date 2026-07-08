//! BLE transport: bridges the ScratchLink JSON-RPC surface (as spoken by the
//! web VM's `scratch-vm/src/io/ble.js`) onto `tauri-plugin-blec` (btleplug).
//!
//! Web → native requests:  discover / connect / write / read / startNotifications / ping
//! Native → web notifications: didDiscoverPeripheral / characteristicDidChange
//!
//! blec addresses characteristics by a bare `Uuid` (service pairing is implicit
//! in its internal characteristic registry), so `serviceId` is only echoed back
//! in notifications; `characteristicId` drives read/write/subscribe.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use tauri_plugin_blec::models::{BleDevice, ScanFilter, WriteType};

use super::Outbound;

/// Handle one text frame on a `/scratch/ble` socket.
pub async fn dispatch(txt: &str, out: &Outbound) {
    let req: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[scratchlink/ble] bad JSON: {e}");
            return;
        }
    };
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or(Value::Null);
    log::info!("[scratchlink/ble] ◀ {method}");

    let result = handle(method, &params, out).await;
    if let Some(id) = id {
        match result {
            Ok(v) => reply(out, id, v).await,
            Err(e) => {
                log::warn!("[scratchlink/ble] {method} error: {e}");
                reply_err(out, id, &e).await;
            }
        }
    }
}

async fn handle(method: &str, params: &Value, out: &Outbound) -> Result<Value, String> {
    // `ping` needs no BLE adapter — answer before touching the handler.
    if method == "ping" {
        return Ok(json!(42));
    }
    let h = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    match method {
        // Returns immediately; discovered devices stream back as notifications.
        "discover" => {
            start_discover(params, out.clone());
            Ok(Value::Null)
        }
        "connect" => {
            let addr = params
                .get("peripheralId")
                .and_then(Value::as_str)
                .ok_or("missing peripheralId")?
                .to_string();
            let on_disconnect: tauri_plugin_blec::OnDisconnectHandler =
                (move || log::info!("[scratchlink/ble] peripheral disconnected")).into();
            h.connect(&addr, on_disconnect)
                .await
                .map_err(|e| e.to_string())?;
            // Populate blec's characteristic registry for send/recv/subscribe.
            h.discover_services(&addr)
                .await
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "write" => {
            let uuid = parse_uuid(params.get("characteristicId"))?;
            let data = decode_message(params)?;
            let write_type = if params.get("withResponse").and_then(Value::as_bool).unwrap_or(false)
            {
                WriteType::WithResponse
            } else {
                WriteType::WithoutResponse
            };
            let n = data.len();
            h.send_data(uuid, &data, write_type)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!(n))
        }
        "read" => {
            let uuid = parse_uuid(params.get("characteristicId"))?;
            let data = h.recv_data(uuid).await.map_err(|e| e.to_string())?;
            if params
                .get("startNotifications")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                subscribe(uuid, params, out.clone()).await?;
            }
            Ok(json!({ "message": B64.encode(&data), "encoding": "base64" }))
        }
        "startNotifications" => {
            let uuid = parse_uuid(params.get("characteristicId"))?;
            subscribe(uuid, params, out.clone()).await?;
            Ok(Value::Null)
        }
        other => Err(format!("unknown method: {other}")),
    }
}

/// Subscribe to a characteristic; each notification is forwarded to the web VM
/// as a `characteristicDidChange`. The blec callback is synchronous, so it uses
/// the channel's non-blocking `try_send`.
async fn subscribe(uuid: Uuid, params: &Value, out: Outbound) -> Result<(), String> {
    let service_id = params.get("serviceId").cloned().unwrap_or(Value::Null);
    let characteristic_id = params.get("characteristicId").cloned().unwrap_or(Value::Null);
    let h = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    h.subscribe(uuid, move |data: Vec<u8>| {
        let note = json!({
            "jsonrpc": "2.0",
            "method": "characteristicDidChange",
            "params": {
                "serviceId": service_id,
                "characteristicId": characteristic_id,
                "message": B64.encode(&data),
                "encoding": "base64"
            }
        });
        let _ = out.try_send(Message::Text(note.to_string()));
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Kick off a scan and stream `didDiscoverPeripheral` notifications as devices
/// appear. Runs for a fixed window matching the VM's 15s discovery timeout.
fn start_discover(params: &Value, out: Outbound) {
    let filter = build_scan_filter(params);
    tokio::spawn(async move {
        let h = match tauri_plugin_blec::get_handler() {
            Ok(h) => h,
            Err(e) => {
                log::error!("[scratchlink/ble] discover: {e}");
                return;
            }
        };
        let (dtx, mut drx) = mpsc::channel::<Vec<BleDevice>>(16);
        if let Err(e) = h.discover(Some(dtx), 15_000, filter).await {
            log::error!("[scratchlink/ble] scan failed: {e}");
            return;
        }
        while let Some(batch) = drx.recv().await {
            for d in batch {
                let note = json!({
                    "jsonrpc": "2.0",
                    "method": "didDiscoverPeripheral",
                    "params": { "peripheralId": d.address, "name": d.name, "rssi": d.rssi }
                });
                let _ = out.try_send(Message::Text(note.to_string()));
            }
        }
    });
}

/// Build a blec scan filter from the VM's `{filters:[{services:[…]}]}`. LEGO
/// hubs advertise their primary service, so an any-service filter is both
/// selective and reliable; manufacturer-data filters are left for a later pass.
fn build_scan_filter(params: &Value) -> ScanFilter {
    let mut services = Vec::new();
    if let Some(filters) = params.get("filters").and_then(Value::as_array) {
        for f in filters {
            if let Some(svcs) = f.get("services").and_then(Value::as_array) {
                for s in svcs {
                    if let Ok(u) = parse_uuid(Some(s)) {
                        services.push(u);
                    }
                }
            }
        }
    }
    if services.is_empty() {
        ScanFilter::None
    } else {
        ScanFilter::AnyService(services)
    }
}

fn decode_message(params: &Value) -> Result<Vec<u8>, String> {
    let msg = params
        .get("message")
        .and_then(Value::as_str)
        .ok_or("missing message")?;
    match params.get("encoding").and_then(Value::as_str).unwrap_or("base64") {
        "base64" => B64.decode(msg).map_err(|e| e.to_string()),
        other => Err(format!("unsupported encoding: {other}")),
    }
}

/// Accept either a full 128-bit UUID string or a 16/32-bit Bluetooth short id
/// (as a hex string or a number), expanding shorts with the Bluetooth base UUID.
fn parse_uuid(v: Option<&Value>) -> Result<Uuid, String> {
    let v = v.ok_or("missing uuid")?;
    if let Some(s) = v.as_str() {
        if let Ok(u) = Uuid::parse_str(s) {
            return Ok(u);
        }
        if let Ok(n) = u32::from_str_radix(s.trim_start_matches("0x"), 16) {
            return Ok(short_uuid(n));
        }
    }
    if let Some(n) = v.as_u64() {
        return Ok(short_uuid(n as u32));
    }
    Err(format!("invalid uuid: {v}"))
}

/// 0000xxxx-0000-1000-8000-00805F9B34FB
fn short_uuid(n: u32) -> Uuid {
    Uuid::from_fields(
        n,
        0x0000,
        0x1000,
        &[0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB],
    )
}

async fn reply(out: &Outbound, id: Value, result: Value) {
    let msg = json!({ "jsonrpc": "2.0", "id": id, "result": result });
    let _ = out.send(Message::Text(msg.to_string())).await;
}

async fn reply_err(out: &Outbound, id: Value, message: &str) {
    let msg = json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } });
    let _ = out.send(Message::Text(msg.to_string())).await;
}

/// Disconnect any connected peripheral when the web socket drops, so a
/// subsequent session can reconnect cleanly.
pub async fn cleanup() {
    if let Ok(h) = tauri_plugin_blec::get_handler() {
        if h.is_connected() {
            let _ = h.disconnect().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const BASE: &str = "-0000-1000-8000-00805f9b34fb";

    #[test]
    fn parse_full_uuid() {
        let v = json!("00001623-1212-efde-1623-785feabcd123");
        assert_eq!(
            parse_uuid(Some(&v)).unwrap().to_string(),
            "00001623-1212-efde-1623-785feabcd123"
        );
    }

    #[test]
    fn parse_short_uuid_hex_string() {
        let v = json!("1623");
        assert_eq!(parse_uuid(Some(&v)).unwrap().to_string(), format!("00001623{BASE}"));
    }

    #[test]
    fn parse_short_uuid_with_0x_prefix() {
        let v = json!("0x1623");
        assert_eq!(parse_uuid(Some(&v)).unwrap().to_string(), format!("00001623{BASE}"));
    }

    #[test]
    fn parse_short_uuid_numeric() {
        let v = json!(0x1623);
        assert_eq!(parse_uuid(Some(&v)).unwrap().to_string(), format!("00001623{BASE}"));
    }

    #[test]
    fn parse_uuid_rejects_garbage_and_none() {
        assert!(parse_uuid(Some(&json!("nope"))).is_err());
        assert!(parse_uuid(None).is_err());
    }

    #[test]
    fn decode_base64_message() {
        let p = json!({ "message": "AQID", "encoding": "base64" });
        assert_eq!(decode_message(&p).unwrap(), vec![1u8, 2, 3]);
    }

    #[test]
    fn decode_defaults_to_base64_when_encoding_absent() {
        let p = json!({ "message": "AQID" });
        assert_eq!(decode_message(&p).unwrap(), vec![1u8, 2, 3]);
    }

    #[test]
    fn decode_rejects_missing_and_unknown_encoding() {
        assert!(decode_message(&json!({})).is_err());
        assert!(decode_message(&json!({ "message": "AQID", "encoding": "hex" })).is_err());
    }

    #[test]
    fn scan_filter_collects_services() {
        let p = json!({ "filters": [
            { "services": ["00001623-1212-efde-1623-785feabcd123"] },
            { "services": ["1624"] }
        ]});
        match build_scan_filter(&p) {
            ScanFilter::AnyService(v) => assert_eq!(v.len(), 2),
            _ => panic!("expected AnyService"),
        }
    }

    #[test]
    fn scan_filter_none_when_no_services() {
        assert!(matches!(build_scan_filter(&json!({})), ScanFilter::None));
        assert!(matches!(
            build_scan_filter(&json!({ "filters": [{ "namePrefix": "LEGO" }] })),
            ScanFilter::None
        ));
    }
}
