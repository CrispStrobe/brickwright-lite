//! iOS Bluetooth-Classic (RFCOMM over MFi ExternalAccessory) — Rust side of the
//! ObjC shim in `bt_ios.m`. Same C ABI + JSON-RPC bridge as the macOS backend
//! (discover/connect/send → didDiscoverPeripheral/didReceiveMessage), for the
//! EV3 + NXT via MFi. The accessory must be paired in iOS Settings first.
use std::ffi::{c_char, c_int, c_uchar, c_uint, c_void, CStr, CString};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

use super::Outbound;

type DeviceCb = extern "C" fn(*const c_char, *const c_char, c_int, *mut c_void);
type DataCb = extern "C" fn(*const c_uchar, c_uint, *mut c_void);
type EventCb = extern "C" fn(c_int, *mut c_void);

extern "C" {
    fn bw_bt_discover(major: c_int, minor: c_int, cb: DeviceCb, ctx: *mut c_void);
    fn bw_bt_stop_discover();
    fn bw_bt_connect(address: *const c_char, data_cb: DataCb, event_cb: EventCb, ctx: *mut c_void);
    fn bw_bt_send(data: *const c_uchar, len: c_uint);
    fn bw_bt_disconnect();
}

struct BtState {
    out: Outbound,
    /// The id of a `connect` request whose response is deferred until the native
    /// connect-result event arrives.
    pending_connect: Option<Value>,
}

static STATE: Mutex<Option<BtState>> = Mutex::new(None);

fn cstr(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

extern "C" fn on_device(addr: *const c_char, name: *const c_char, rssi: c_int, _ctx: *mut c_void) {
    let (addr, name) = (cstr(addr), cstr(name));
    if let Some(st) = STATE.lock().unwrap().as_ref() {
        let note = json!({
            "jsonrpc": "2.0",
            "method": "didDiscoverPeripheral",
            "params": { "peripheralId": addr, "name": name, "rssi": rssi }
        });
        let _ = st.out.try_send(Message::Text(note.to_string()));
    }
}

extern "C" fn on_data(data: *const c_uchar, len: c_uint, _ctx: *mut c_void) {
    let bytes = unsafe { std::slice::from_raw_parts(data, len as usize) };
    let b64 = B64.encode(bytes);
    if let Some(st) = STATE.lock().unwrap().as_ref() {
        let note = json!({
            "jsonrpc": "2.0",
            "method": "didReceiveMessage",
            "params": { "message": b64, "encoding": "base64" }
        });
        let _ = st.out.try_send(Message::Text(note.to_string()));
    }
}

// event: 1 = connected, 0 = closed, -1 = connect failed
extern "C" fn on_event(event: c_int, _ctx: *mut c_void) {
    let mut guard = STATE.lock().unwrap();
    let Some(st) = guard.as_mut() else { return };
    if let Some(id) = st.pending_connect.take() {
        let msg = if event == 1 {
            json!({ "jsonrpc": "2.0", "id": id, "result": Value::Null })
        } else {
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": "bluetooth connect failed" } })
        };
        let _ = st.out.try_send(Message::Text(msg.to_string()));
    }
}

/// Handle one text frame on a `/scratch/bt` socket (macOS RFCOMM backend).
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
            let major = params.get("majorDeviceClass").and_then(Value::as_i64).unwrap_or(8) as c_int;
            let minor = params.get("minorDeviceClass").and_then(Value::as_i64).unwrap_or(1) as c_int;
            *STATE.lock().unwrap() = Some(BtState { out: out.clone(), pending_connect: None });
            unsafe { bw_bt_discover(major, minor, on_device, std::ptr::null_mut()) };
            reply(out, id, Value::Null).await;
        }
        "connect" => {
            let Some(addr) = params.get("peripheralId").and_then(Value::as_str) else {
                reply_err(out, id, "missing peripheralId").await;
                return;
            };
            {
                let mut guard = STATE.lock().unwrap();
                let st = guard.get_or_insert_with(|| BtState { out: out.clone(), pending_connect: None });
                st.out = out.clone();
                st.pending_connect = id; // response deferred to on_event
            }
            match CString::new(addr) {
                Ok(c) => unsafe { bw_bt_connect(c.as_ptr(), on_data, on_event, std::ptr::null_mut()) },
                Err(_) => {
                    if let Some(st) = STATE.lock().unwrap().as_mut() {
                        st.pending_connect = None;
                    }
                }
            }
        }
        "send" => {
            match decode_message(&params) {
                Ok(data) => {
                    unsafe { bw_bt_send(data.as_ptr(), data.len() as c_uint) };
                    reply(out, id, json!(data.len())).await;
                }
                Err(e) => reply_err(out, id, &e).await,
            }
        }
        other => reply_err(out, id, &format!("unknown method: {other}")).await,
    }
}

/// Tear down the native session when the web socket drops.
pub fn cleanup() {
    unsafe {
        bw_bt_stop_discover();
        bw_bt_disconnect();
    }
    *STATE.lock().unwrap() = None;
}

fn decode_message(params: &Value) -> Result<Vec<u8>, String> {
    let msg = params.get("message").and_then(Value::as_str).ok_or("missing message")?;
    match params.get("encoding").and_then(Value::as_str).unwrap_or("base64") {
        "base64" => B64.decode(msg).map_err(|e| e.to_string()),
        other => Err(format!("unsupported encoding: {other}")),
    }
}

async fn reply(out: &Outbound, id: Option<Value>, result: Value) {
    let Some(id) = id else { return };
    let msg = json!({ "jsonrpc": "2.0", "id": id, "result": result });
    let _ = out.send(Message::Text(msg.to_string())).await;
}

async fn reply_err(out: &Outbound, id: Option<Value>, message: &str) {
    let Some(id) = id else { return };
    let msg = json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message } });
    let _ = out.send(Message::Text(msg.to_string())).await;
}
