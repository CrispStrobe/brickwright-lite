//! Android Bluetooth-Classic (RFCOMM/SPP) backend via JNI, for EV3 + legacy
//! SPIKE. Calls android.bluetooth directly from Rust using the JNI env from
//! `ndk_context` (populated by Tauri's Android runtime). Android only exposes
//! RFCOMM to bonded devices, so `discover` lists bonded SPP devices.
//!
//! NOTE: runtime-unverified — depends on ndk_context being available in the
//! Tauri Android process and needs a real device + paired EV3 to exercise. The
//! app also needs BLUETOOTH_CONNECT permission (contributed via the manifest).

use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use jni::objects::GlobalRef;
use jni::JavaVM;
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

use super::Outbound;

const SPP_UUID: &str = "00001101-0000-1000-8000-00805F9B34FB";

// The connected BluetoothSocket, kept alive as a global ref. One at a time.
static SOCKET: Mutex<Option<GlobalRef>> = Mutex::new(None);

fn vm() -> Result<JavaVM, String> {
    let ctx = ndk_context::android_context();
    unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|e| e.to_string())
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
            let major = params.get("majorDeviceClass").and_then(Value::as_i64);
            let minor = params.get("minorDeviceClass").and_then(Value::as_i64);
            let out2 = out.clone();
            let _ = tokio::task::spawn_blocking(move || discover_blocking(&out2, major, minor)).await;
            reply(out, id, Value::Null).await;
        }
        "connect" => {
            let Some(addr) = params.get("peripheralId").and_then(Value::as_str).map(String::from)
            else {
                reply_err(out, id, "missing peripheralId").await;
                return;
            };
            let out2 = out.clone();
            let res = tokio::task::spawn_blocking(move || connect_blocking(&addr, out2))
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

/// Does this bonded device match the class the client asked for?
///
/// The reference's BTSession REQUIRES majorDeviceClass and minorDeviceClass on
/// a `discover`, and EV3 sends 8/1 (toy / robot). We ignored them here, so
/// asking for EV3 bricks listed every bonded device — headphones, phones,
/// keyboards — as candidates.
///
/// FAILS OPEN. If the class cannot be read for a device it is included, because
/// the alternative is a JNI mistake silently hiding every EV3 on the system.
/// Unfiltered is the behaviour this has always had; invisible is worse.
///
/// Android reports the major class pre-shifted (TOY is 0x0800) and packs the
/// minor into bits 2..7 of getDeviceClass(), while Scratch sends the raw 5-bit
/// major and the raw minor — hence the shifts.
fn class_matches(
    env: &mut jni::JNIEnv,
    dev: &jni::objects::JObject,
    want_major: Option<i64>,
    want_minor: Option<i64>,
) -> bool {
    if want_major.is_none() && want_minor.is_none() {
        return true;
    }
    let read = (|| -> jni::errors::Result<(i32, i32)> {
        let class = env
            .call_method(dev, "getBluetoothClass", "()Landroid/bluetooth/BluetoothClass;", &[])?
            .l()?;
        let major = env.call_method(&class, "getMajorDeviceClass", "()I", &[])?.i()?;
        let device = env.call_method(&class, "getDeviceClass", "()I", &[])?.i()?;
        Ok((major >> 8, (device >> 2) & 0x3F))
    })();
    let Ok((major, minor)) = read else {
        return true;
    };
    if let Some(m) = want_major {
        if i64::from(major) != m {
            return false;
        }
    }
    if let Some(m) = want_minor {
        if i64::from(minor) != m {
            return false;
        }
    }
    true
}

fn discover_blocking(out: &Outbound, want_major: Option<i64>, want_minor: Option<i64>) -> Result<(), String> {
    let vm = vm()?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    (|| -> jni::errors::Result<()> {
        let adapter = env
            .call_static_method(
                "android/bluetooth/BluetoothAdapter",
                "getDefaultAdapter",
                "()Landroid/bluetooth/BluetoothAdapter;",
                &[],
            )?
            .l()?;
        let set = env
            .call_method(&adapter, "getBondedDevices", "()Ljava/util/Set;", &[])?
            .l()?;
        let arr = env.call_method(&set, "toArray", "()[Ljava/lang/Object;", &[])?.l()?;
        let arr: jni::objects::JObjectArray = arr.into();
        let len = env.get_array_length(&arr)?;
        for i in 0..len {
            let dev = env.get_object_array_element(&arr, i)?;
            let name: String = {
                let s = env.call_method(&dev, "getName", "()Ljava/lang/String;", &[])?.l()?;
                env.get_string(&s.into()).map(|s| s.into()).unwrap_or_default()
            };
            if !class_matches(&mut env, &dev, want_major, want_minor) {
                continue;
            }
            let addr: String = {
                let s = env.call_method(&dev, "getAddress", "()Ljava/lang/String;", &[])?.l()?;
                env.get_string(&s.into()).map(|s| s.into()).unwrap_or_default()
            };
            let note = json!({
                "jsonrpc": "2.0",
                "method": "didDiscoverPeripheral",
                "params": { "peripheralId": addr, "name": name, "rssi": 0 }
            });
            let _ = out.try_send(Message::Text(note.to_string()));
        }
        Ok(())
    })()
    .map_err(|e| e.to_string())
}

fn connect_blocking(addr: &str, out: Outbound) -> Result<(), String> {
    let vm = vm()?;
    let socket_ref = {
        let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
        (|| -> jni::errors::Result<GlobalRef> {
            let adapter = env
                .call_static_method(
                    "android/bluetooth/BluetoothAdapter",
                    "getDefaultAdapter",
                    "()Landroid/bluetooth/BluetoothAdapter;",
                    &[],
                )?
                .l()?;
            let jaddr = env.new_string(addr)?;
            let device = env
                .call_method(
                    &adapter,
                    "getRemoteDevice",
                    "(Ljava/lang/String;)Landroid/bluetooth/BluetoothDevice;",
                    &[(&jaddr).into()],
                )?
                .l()?;
            let juuid_str = env.new_string(SPP_UUID)?;
            let uuid = env
                .call_static_method(
                    "java/util/UUID",
                    "fromString",
                    "(Ljava/lang/String;)Ljava/util/UUID;",
                    &[(&juuid_str).into()],
                )?
                .l()?;
            let socket = env
                .call_method(
                    &device,
                    "createRfcommSocketToServiceRecord",
                    "(Ljava/util/UUID;)Landroid/bluetooth/BluetoothSocket;",
                    &[(&uuid).into()],
                )?
                .l()?;
            env.call_method(&socket, "connect", "()V", &[])?;
            env.new_global_ref(&socket)
        })()
        .map_err(|e| e.to_string())?
    };
    *SOCKET.lock().unwrap() = Some(socket_ref.clone());

    // Read loop on its own thread with an attached JNI env.
    std::thread::spawn(move || {
        let vm = match vm.attach_current_thread() {
            Ok(env) => env,
            Err(_) => return,
        };
        let mut env = vm;
        let _ = (|| -> jni::errors::Result<()> {
            let input = env
                .call_method(socket_ref.as_obj(), "getInputStream", "()Ljava/io/InputStream;", &[])?
                .l()?;
            let buf = env.new_byte_array(1024)?;
            loop {
                let n = env
                    .call_method(&input, "read", "([B)I", &[(&buf).into()])?
                    .i()?;
                if n <= 0 {
                    break;
                }
                let bytes = env.convert_byte_array(&buf)?;
                let note = json!({
                    "jsonrpc": "2.0",
                    "method": "didReceiveMessage",
                    "params": { "message": B64.encode(&bytes[..n as usize]), "encoding": "base64" }
                });
                let _ = out.try_send(Message::Text(note.to_string()));
            }
            Ok(())
        })();
    });
    Ok(())
}

fn send_blocking(data: &[u8]) -> Result<(), String> {
    let socket = SOCKET.lock().unwrap().clone().ok_or("not connected")?;
    let vm = vm()?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    (|| -> jni::errors::Result<()> {
        let output = env
            .call_method(socket.as_obj(), "getOutputStream", "()Ljava/io/OutputStream;", &[])?
            .l()?;
        let arr = env.byte_array_from_slice(data)?;
        env.call_method(&output, "write", "([B)V", &[(&arr).into()])?;
        env.call_method(&output, "flush", "()V", &[])?;
        Ok(())
    })()
    .map_err(|e| e.to_string())
}

pub fn cleanup() {
    if let Some(socket) = SOCKET.lock().unwrap().take() {
        if let Ok(vm) = vm() {
            if let Ok(mut env) = vm.attach_current_thread() {
                let _ = env.call_method(socket.as_obj(), "close", "()V", &[]);
            }
        }
    }
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
