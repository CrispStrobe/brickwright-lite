//! BLE transport: bridges the ScratchLink JSON-RPC surface (as spoken by the
//! web VM's `scratch-vm/src/io/ble.js`) onto `tauri-plugin-blec` (btleplug).
//!
//! Web → native requests:  discover / connect / write / read / startNotifications / ping
//! Native → web notifications: didDiscoverPeripheral / characteristicDidChange
//!
//! Two methods here are NOT part of Scratch Link's protocol and are only ever
//! called by Brickwright's own web side (`native-ble.js`):
//!
//!   getStatus    — adapter permission/power, so a failure to find anything can
//!                  be explained instead of just timing out. See ble_state.rs.
//!   getServices  — the connected peripheral's services and characteristics,
//!                  which the Web Bluetooth shim needs for getPrimaryServices()
//!                  and getCharacteristics(). Scratch Link never enumerates,
//!                  because the VM always knows its UUIDs up front.
//!
//! Real Scratch Link answers both with a method-not-found error, which the web
//! side treats as "this feature is unavailable" rather than as a failure.
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
    // The two calls the OFFICIAL Scratch Link answers on its base Session, so
    // every session type has them (scratch-link macOS/Sources/scratch-link/
    // Session.swift). We had neither, which meant a client written against the
    // real thing — and every client is — could ask us something it is entitled
    // to ask and get "unknown method" back.
    //
    // `getVersion` reports the NETWORK PROTOCOL version, not ours: 1.2 is what
    // the upstream Session declares, and answering with a Brickwright version
    // here would be a different number wearing the same key.
    if method == "getVersion" {
        return Ok(json!({ "protocol": "1.2" }));
    }
    // `pingMe` replies "willPing" and THEN sends the client a `ping` request.
    // The reply is the acknowledgement; the ping is a separate frame, which is
    // why it is emitted rather than returned.
    if method == "pingMe" {
        let out = out.clone();
        tauri::async_runtime::spawn(async move {
            let msg = json!({ "jsonrpc": "2.0", "method": "ping", "params": {} });
            let _ = out.send(Message::Text(msg.to_string())).await;
        });
        return Ok(json!("willPing"));
    }
    // `getStatus` must answer even when the handler failed to initialise: that
    // IS the diagnosis, and swallowing it into a generic error is what made the
    // original failure invisible.
    if method == "getStatus" {
        let h = tauri_plugin_blec::get_handler().ok();
        let (scanning, connected) = match h {
            Some(h) => (h.is_scanning().await, h.is_connected()),
            None => (false, false),
        };
        let mut v = super::ble_state::status(scanning, connected);
        v["handler"] = json!(h.is_some());
        return Ok(v);
    }
    let h = tauri_plugin_blec::get_handler().map_err(|e| e.to_string())?;
    match method {
        // Returns immediately; discovered devices stream back as notifications.
        "discover" => {
            // Validate BEFORE scanning, as the reference does: a malformed
            // request must be an error, not fifteen seconds of offering the
            // user every device in the building.
            let specs = parse_filters(params)?;
            start_discover(specs, out.clone());
            Ok(Value::Null)
        }
        "connect" => {
            let addr = params
                .get("peripheralId")
                .and_then(Value::as_str)
                .ok_or("missing or invalid peripheralId")?
                .to_string();
            if !was_reported(&addr) {
                return Err(format!("invalid peripheralId: {addr}"));
            }
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
            check_blocklist(params, true)?;
            let uuid = parse_uuid(params.get("characteristicId"))?;
            let data = decode_message(params)?;
            let write_type = choose_write_type(h, uuid, params).await;
            let n = data.len();
            h.send_data(uuid, &data, write_type)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!(n))
        }
        "read" => {
            check_blocklist(params, false)?;
            let uuid = parse_uuid(params.get("characteristicId"))?;
            let data = h.recv_data(uuid).await.map_err(|e| e.to_string())?;
            if params
                .get("startNotifications")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                subscribe(uuid, params, out.clone()).await?;
            }
            // The reference encodes a read with the encoding the CLIENT asked
            // for; only notifications are unconditionally base64.
            encode_message(&data, params.get("encoding").and_then(Value::as_str))
        }
        "startNotifications" => {
            check_blocklist(params, false)?;
            let uuid = parse_uuid(params.get("characteristicId"))?;
            subscribe(uuid, params, out.clone()).await?;
            Ok(Value::Null)
        }
        // The official BLESession has this and we did not, so a client that
        // stopped listening — which any well-behaved one does before switching
        // characteristics or disconnecting — got "unknown method" and had to
        // treat a legitimate request as an error. Notifications then kept
        // arriving for a characteristic nobody was reading any more.
        "stopNotifications" => {
            check_blocklist(params, false)?;
            let uuid = parse_uuid(params.get("characteristicId"))?;
            h.unsubscribe(uuid).await.map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        // Non-standard; see the module header. The address is optional so the
        // shim can ask about whatever is currently connected.
        "getServices" => {
            let addr = match params.get("peripheralId").and_then(Value::as_str) {
                Some(a) => a.to_string(),
                None => h
                    .connected_device()
                    .await
                    .map_err(|e| e.to_string())?
                    .address,
            };
            let services = h.discover_services(&addr).await.map_err(|e| e.to_string())?;
            Ok(json!(services))
        }
        other => Err(format!("{UNKNOWN_METHOD}{other}")),
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
fn start_discover(specs: Vec<ScanFilterSpec>, out: Outbound) {
    // A new discovery invalidates the last one's results, exactly as the
    // reference clears reportedPeripherals here.
    reset_reported();
    // Scan for EVERYTHING and match in software, exactly as the reference does
    // (`central.scanForPeripherals(withServices: nil)`). An adapter-level
    // service filter would be cheaper but wrong the moment a filter selects by
    // name or manufacturer data instead — which two shipped extensions do.
    let filter = ScanFilter::None;
    tokio::spawn(async move {
        let h = match tauri_plugin_blec::get_handler() {
            Ok(h) => h,
            Err(e) => {
                log::error!("[scratchlink/ble] discover: {e}");
                scan_failed(&out, &format!("BLE is unavailable: {e}")).await;
                return;
            }
        };
        // Say up front whether the adapter can even scan. btleplug's start_scan
        // against a central that is not powered on is a SILENT no-op on Apple
        // platforms, so without this the only symptom is a 15 s wait followed by
        // "no device found" — the exact report this whole path was failing with.
        let status = super::ble_state::status(false, false);
        if status["usable"] == json!(false) {
            let why = status["advice"].as_str().unwrap_or("Bluetooth is unavailable");
            log::warn!("[scratchlink/ble] refusing to scan: {why}");
            scan_failed(&out, why).await;
            return;
        }
        let (dtx, mut drx) = mpsc::channel::<Vec<BleDevice>>(16);
        if let Err(e) = h.discover(Some(dtx), 15_000, filter).await {
            log::error!("[scratchlink/ble] scan failed: {e}");
            scan_failed(&out, &format!("scan failed: {e}")).await;
            return;
        }
        // blec re-reports every peripheral it has seen on each 200 ms poll, so
        // over a 15 s scan one hub arrives 75 times. Deduplicating here keeps the
        // socket (and the diagnostics log) readable, and matters more than it
        // looks: the outbound channel holds 64 frames and drops on overflow, so
        // the undeduplicated flood could evict a real reply.
        let mut seen = std::collections::HashSet::new();
        while let Some(batch) = drx.recv().await {
            for d in batch {
                if !device_matches(&specs, &d) {
                    continue;
                }
                if !seen.insert(d.address.clone()) {
                    continue;
                }
                log::info!("[scratchlink/ble] discovered {} ({})", d.name, d.address);
                remember_reported(&d.address);
                let note = json!({
                    "jsonrpc": "2.0",
                    "method": "didDiscoverPeripheral",
                    "params": { "peripheralId": d.address, "name": d.name, "rssi": d.rssi }
                });
                let _ = out.try_send(Message::Text(note.to_string()));
            }
        }
        if seen.is_empty() {
            log::warn!("[scratchlink/ble] scan finished with no peripherals");
        }
        // The web side has no other way to learn the scan window closed: the
        // `discover` reply returns immediately, and Scratch Link itself never
        // says "done". Without this the UI can only wait out its own timeout.
        let note = json!({
            "jsonrpc": "2.0",
            "method": "discoverDidFinish",
            "params": { "count": seen.len() }
        });
        let _ = out.try_send(Message::Text(note.to_string()));
    });
}

/// Tell the web side a scan could not start, and why. This is a notification
/// rather than an error reply because `discover` has already been answered by
/// the time the scan is attempted.
///
/// TWO frames, on purpose. `discoverDidFail` carries the reason and is ours —
/// only Brickwright's own web code reads it. `userDidNotPickPeripheral` is
/// Scratch Link's, and the stock `io/ble.js` maps it to PERIPHERAL_SCAN_TIMEOUT;
/// without it a stock extension has no idea anything went wrong and sits on its
/// own 15 s timeout before saying "no device found". Same outcome, fifteen
/// seconds of "nothing is happening" earlier.
async fn scan_failed(out: &Outbound, why: &str) {
    let note = json!({
        "jsonrpc": "2.0",
        "method": "discoverDidFail",
        "params": { "message": why }
    });
    let _ = out.send(Message::Text(note.to_string())).await;
    let legacy = json!({
        "jsonrpc": "2.0",
        "method": "userDidNotPickPeripheral",
        "params": {}
    });
    let _ = out.send(Message::Text(legacy.to_string())).await;
}

/// Build a blec scan filter from the VM's `{filters:[{services:[…]}]}`. LEGO
/// hubs advertise their primary service, so an any-service filter is both
/// selective and reliable; manufacturer-data filters are left for a later pass.
/// One entry of a `discover` request's `filters` array, with Web Bluetooth's
/// matching rules.
///
/// Ported from the reference implementation's `BLEScanFilter`
/// (scratch-link macOS/Sources/scratch-link/BLESession.swift). Until
/// 2026-08-28 we honoured only `services` and ignored the rest, which is not a
/// cosmetic gap:
///
///   * `scratch3_gdx_for` filters on `namePrefix: "GDX-FOR"` and nothing else,
///     so every BLE device in range was offered as a force sensor.
///   * `scratch3_boost` filters on the LEGO service AND
///     `manufacturerData {0x0397: dataPrefix 00 40, mask 00 FF}`. The service
///     alone does not distinguish a Boost hub from a WeDo 2.0 or Powered Up
///     hub, so we offered those as Boost hubs — the user connects, and every
///     block afterwards is plausible and wrong.
#[derive(Debug, Default, Clone)]
pub struct ScanFilterSpec {
    name: Option<String>,
    name_prefix: Option<String>,
    services: Vec<Uuid>,
    /// company id → (dataPrefix, mask), both the same length.
    manufacturer_data: Vec<(u16, Vec<u8>, Vec<u8>)>,
}

impl ScanFilterSpec {
    /// Parse one filter, rejecting what the reference rejects.
    fn parse(json: &Value) -> Result<Self, String> {
        let mut spec = ScanFilterSpec::default();
        if let Some(n) = json.get("name").and_then(Value::as_str) {
            spec.name = Some(n.to_string());
        }
        if let Some(p) = json.get("namePrefix").and_then(Value::as_str) {
            spec.name_prefix = Some(p.to_string());
        }
        if let Some(svcs) = json.get("services").and_then(Value::as_array) {
            for s in svcs {
                spec.services.push(parse_uuid(Some(s))?);
            }
        }
        if let Some(md) = json.get("manufacturerData").and_then(Value::as_object) {
            for (k, v) in md {
                // JavaScript object keys are strings even when the extension
                // wrote a number, which is why the reference parses them too.
                let id: u16 = k
                    .parse()
                    .map_err(|_| format!("could not parse manufacturer id: {k}"))?;
                let prefix = byte_array(v.get("dataPrefix"))
                    .ok_or_else(|| "no data prefix specified".to_string())?;
                // An absent mask means "match every byte of the prefix".
                let mask = match byte_array(v.get("mask")) {
                    Some(m) => m,
                    None => vec![0xFF; prefix.len()],
                };
                if prefix.len() != mask.len() {
                    return Err("length of data prefix does not match length of mask".into());
                }
                spec.manufacturer_data.push((id, prefix, mask));
            }
        }
        Ok(spec)
    }

    /// A filter that constrains nothing. The reference refuses these rather
    /// than letting a malformed request quietly offer every device in range.
    fn is_empty(&self) -> bool {
        self.name.as_deref().unwrap_or("").is_empty()
            && self.name_prefix.as_deref().unwrap_or("").is_empty()
            && self.services.is_empty()
            && self.manufacturer_data.is_empty()
    }

    /// Web Bluetooth's "matches a filter", against what blec reports.
    fn matches(&self, d: &BleDevice) -> bool {
        let has_name = !d.name.is_empty();
        if has_name {
            if let Some(n) = self.name.as_deref() {
                if !n.is_empty() && d.name != n {
                    return false;
                }
            }
            if let Some(p) = self.name_prefix.as_deref() {
                if !p.is_empty() && !d.name.starts_with(p) {
                    return false;
                }
            }
        } else if !self.name.as_deref().unwrap_or("").is_empty()
            || !self.name_prefix.as_deref().unwrap_or("").is_empty()
        {
            // Asked for a name, device has none.
            return false;
        }

        // Required services must be a SUBSET of what the device offers — not
        // an intersection. A filter naming two services wants both.
        if !self.services.is_empty() && !self.services.iter().all(|s| d.services.contains(s)) {
            return false;
        }

        for (id, prefix, mask) in &self.manufacturer_data {
            // blec has already split the company id out of the advertisement,
            // so the map key IS the id the reference decodes from the first two
            // bytes; the value is what it calls devicePrefix.
            let Some(data) = d.manufacturer_data.get(id) else {
                return false;
            };
            if data.len() < mask.len() {
                return false;
            }
            // Iterator rather than an index range: clippy runs with -D warnings
            // in CI and needless_range_loop would fail the build. zip stops at
            // the shortest, and prefix.len() == mask.len() <= data.len() here.
            let ok = data
                .iter()
                .zip(prefix.iter().zip(mask.iter()))
                .all(|(d, (p, m))| (d & m) == (p & m));
            if !ok {
                return false;
            }
        }
        true
    }
}

/// What a blocked UUID may still be used for.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BlockedFor {
    /// Neither reads nor writes.
    All,
    /// Writes only; reading is allowed.
    Writes,
}

/// GATT services, characteristics and descriptors that Web Bluetooth forbids
/// for security or privacy reasons.
///
/// Ported from the reference implementation's `GATTHelpers.BlockList`, itself
/// collected from the Web Bluetooth Registries
/// (<https://github.com/WebBluetoothCG/registries> @ 693db2fe). We had no
/// blocklist at all, which meant an extension — ours, a gallery one, or a URL a
/// child was talked into pasting — could read or write any of these through us.
/// The comments are upstream's own reasons, kept because they are the argument
/// for each entry.
const BLOCK_LIST: &[(&str, BlockedFor)] = &[
    // Services
    // org.bluetooth.service.human_interface_device
    // Direct access to HID devices would let a page become a keylogger.
    ("00001812-0000-1000-8000-00805f9b34fb", BlockedFor::All),
    // Firmware update services that do not check the update's signature: a
    // route to replacing a device's software outright.
    ("00001530-1212-efde-1523-785feabcd123", BlockedFor::All),
    // TI's Over-the-Air Download service.
    ("f000ffc0-0451-4000-b000-000000000000", BlockedFor::All),
    // Cypress's Bootloader service.
    ("00060000-0000-1000-8000-00805f9b34fb", BlockedFor::All),
    // FIDO U2F — a security key is not something a project should reach.
    ("0000fffd-0000-1000-8000-00805f9b34fb", BlockedFor::All),
    // Characteristics
    // gap.peripheral_privacy_flag — do not let a page turn privacy off.
    ("00002a02-0000-1000-8000-00805f9b34fb", BlockedFor::Writes),
    // gap.reconnection_address — connection parameters are not ours to change.
    ("00002a03-0000-1000-8000-00805f9b34fb", BlockedFor::All),
    // serial_number_string — a standardised unique identifier, i.e. tracking.
    ("00002a25-0000-1000-8000-00805f9b34fb", BlockedFor::All),
    // Descriptors
    // gatt.client_characteristic_configuration — writing it would let a page
    // subscribe or unsubscribe behind the client's back.
    ("00002902-0000-1000-8000-00805f9b34fb", BlockedFor::Writes),
    // gatt.server_characteristic_configuration
    ("00002903-0000-1000-8000-00805f9b34fb", BlockedFor::Writes),
];

/// Refuse a blocked endpoint. `writing` distinguishes the write-only entries.
///
/// Checked on the service AND the characteristic, as the reference does: a
/// blocked characteristic inside an allowed service must still be refused.
pub fn check_blocklist(params: &Value, writing: bool) -> Result<(), String> {
    for key in ["serviceId", "characteristicId"] {
        let Ok(uuid) = parse_uuid(params.get(key)) else {
            continue;
        };
        for (blocked, how) in BLOCK_LIST {
            if Uuid::parse_str(blocked).ok() != Some(uuid) {
                continue;
            }
            if *how == BlockedFor::All || writing {
                return Err(format!(
                    "{uuid} is blocked for security or privacy reasons \
                     (see the Web Bluetooth registries)"
                ));
            }
        }
    }
    Ok(())
}

/// A JSON array of byte values, as the extensions write dataPrefix and mask.
fn byte_array(v: Option<&Value>) -> Option<Vec<u8>> {
    let arr = v?.as_array()?;
    arr.iter()
        .map(|n| n.as_u64().and_then(|x| u8::try_from(x).ok()))
        .collect()
}

/// Parse and validate every filter in a `discover` request.
///
/// The reference throws on a missing `filters`, an empty array, or any filter
/// that constrains nothing; we returned `ScanFilter::None` for all three, which
/// silently offered the user every BLE device in range instead of an error.
pub fn parse_filters(params: &Value) -> Result<Vec<ScanFilterSpec>, String> {
    let Some(arr) = params.get("filters").and_then(Value::as_array) else {
        return Err("could not parse filters in discovery request".into());
    };
    if arr.is_empty() {
        return Err("discovery request must include filters".into());
    }
    let specs: Vec<ScanFilterSpec> = arr
        .iter()
        .map(ScanFilterSpec::parse)
        .collect::<Result<_, _>>()?;
    if specs.iter().any(ScanFilterSpec::is_empty) {
        return Err("discovery request includes empty filter".into());
    }
    Ok(specs)
}

/// Web Bluetooth: a device matches if it matches ANY filter.
pub fn device_matches(specs: &[ScanFilterSpec], d: &BleDevice) -> bool {
    specs.iter().any(|f| f.matches(d))
}

/// Decode a `message` the way the reference does (EncodingHelpers.decodeBuffer).
///
/// The default was INVERTED here. Upstream treats an ABSENT `encoding` as "the
/// message is a Unicode string, send its UTF-8 bytes"; only `"base64"` means
/// base64, and anything else is an error. We defaulted to base64, so a plain
/// string arrived as either a decode failure or, worse, whatever bytes it
/// happened to decode to.
fn decode_message(params: &Value) -> Result<Vec<u8>, String> {
    let msg = params
        .get("message")
        .and_then(Value::as_str)
        .ok_or("missing message property")?;
    match params.get("encoding").and_then(Value::as_str) {
        Some("base64") => B64.decode(msg).map_err(|_| "failed to decode Base64 message".to_string()),
        None => Ok(msg.as_bytes().to_vec()),
        Some(other) => Err(format!("unsupported encoding: {other}")),
    }
}

/// Encode a buffer for a reply, mirroring EncodingHelpers.encodeBuffer: with
/// `base64` the object carries an `encoding` key, without one it carries a
/// plain string and NO encoding key — a client reads that difference.
fn encode_message(data: &[u8], encoding: Option<&str>) -> Result<Value, String> {
    match encoding {
        Some("base64") => Ok(json!({ "message": B64.encode(data), "encoding": "base64" })),
        None => match std::str::from_utf8(data) {
            Ok(text) => Ok(json!({ "message": text })),
            Err(_) => Err("failed to transcode message to UTF-8".into()),
        },
        Some(other) => Err(format!("unsupported encoding: {other}")),
    }
}

/// Which write the reference would use.
///
/// "If the client specified a write type, honour that. Otherwise, if the
/// characteristic claims to support writing without response, do that.
/// Otherwise, write with response." We hardcoded without-response, which is
/// right for the LEGO hubs and wrong for any characteristic that does not
/// support it — there the write silently goes nowhere.
async fn choose_write_type(h: &tauri_plugin_blec::Handler, uuid: Uuid, params: &Value) -> WriteType {
    if let Some(with_response) = params.get("withResponse").and_then(Value::as_bool) {
        return if with_response { WriteType::WithResponse } else { WriteType::WithoutResponse };
    }
    let supports_without = async {
        let addr = h.connected_device().await.ok()?.address;
        let services = h.discover_services(&addr).await.ok()?;
        let ch = services
            .iter()
            .flat_map(|s| s.characteristics.iter())
            .find(|c| c.uuid == uuid)?;
        Some(c_supports_write_without_response(ch))
    }
    .await;
    // Unknown properties fall back to without-response: that is what this
    // always did, so a lookup failure cannot make a working hub stop working.
    match supports_without {
        Some(false) => WriteType::WithResponse,
        _ => WriteType::WithoutResponse,
    }
}

fn c_supports_write_without_response(ch: &tauri_plugin_blec::models::Characteristic) -> bool {
    ch.properties
        .contains(tauri_plugin_blec::models::CharProps::WriteWithoutResponse)
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

/// The prefix `handle` uses for a method it does not implement. Shared with
/// `reply_err` so the two cannot drift: it is what turns into -32601.
/// Addresses reported by the CURRENT discovery, and the only ones `connect`
/// will accept.
///
/// The reference keeps `reportedPeripherals`, clears it at the start of every
/// discover, and refuses a connect to anything not in it. We accepted any
/// address at all — which quietly makes the discovery filter decorative: an
/// extension that knows a MAC can connect to hardware the user never chose and
/// no filter ever matched. The filter and the blocklist are only a boundary if
/// connect respects them.
static REPORTED: std::sync::Mutex<Option<std::collections::HashSet<String>>> =
    std::sync::Mutex::new(None);

/// Begin a discovery: forget what the last one found, as the reference does.
fn reset_reported() {
    if let Ok(mut g) = REPORTED.lock() {
        *g = Some(std::collections::HashSet::new());
    }
}

/// Remember a peripheral we are about to report to the client.
fn remember_reported(addr: &str) {
    if let Ok(mut g) = REPORTED.lock() {
        g.get_or_insert_with(Default::default).insert(addr.to_string());
    }
}

/// Has this address been offered to the client by the current discovery?
///
/// Answers TRUE when no discovery has run in this process yet, so that a
/// reconnect after a restart — or a client that stored a peripheral id — is not
/// broken by a boundary meant for something else. Once a discovery HAS run, the
/// set is authoritative.
fn was_reported(addr: &str) -> bool {
    match REPORTED.lock() {
        Ok(g) => match g.as_ref() {
            Some(set) => set.contains(addr),
            None => true,
        },
        Err(_) => true,
    }
}

pub const UNKNOWN_METHOD: &str = "unknown method: ";

/// A JSON-RPC error, with the standard code where we can tell which it is.
///
/// The reference uses the spec's codes (-32601 Method Not Found, -32602 Invalid
/// Params, …) and puts the detail in `data`, with `message` naming the
/// category. We sent -32000 for everything with the detail in `message`, which
/// scratch-vm tolerates — it only rejects — but which cost us elsewhere:
/// `native-ble.js` detects an unsupported call by STRING-MATCHING
/// /unknown method/i, because there was no code to test. A client should not
/// have to read our prose to learn a feature is missing.
async fn reply_err(out: &Outbound, id: Value, message: &str) {
    let (code, category) = if let Some(detail) = message.strip_prefix(UNKNOWN_METHOD) {
        let _ = detail;
        (-32601, "Method Not Found")
    } else {
        (-32000, "Server Error")
    };
    let msg = json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": category, "data": message }
    });
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

    /// A discovered device, as blec reports one.
    fn device(name: &str, services: &[&str], mfr: &[(u16, &[u8])]) -> BleDevice {
        BleDevice {
            address: "AA:BB:CC:DD:EE:FF".into(),
            name: name.into(),
            is_connected: false,
            manufacturer_data: mfr
                .iter()
                .map(|(id, d)| (*id, d.to_vec()))
                .collect(),
            service_data: Default::default(),
            services: services.iter().map(|s| Uuid::parse_str(s).unwrap()).collect(),
            rssi: Some(-55),
        }
    }

    const LEGO_SERVICE: &str = "00001623-1212-efde-1623-785feabcd123";

    // ── the two shipped extensions that our old filter got wrong ──────────

    // ── connect is bounded by what discovery reported ────────────────────

    #[test]
    fn connect_is_bounded_by_the_current_discovery() {
        // ONE test rather than three, because REPORTED is process-global and
        // cargo runs tests in parallel: three tests asserting different phases
        // of the same global would race each other and fail at random.
        //
        // Before any discovery the set is absent and connect stays open, so a
        // client reconnecting after a restart is not broken by a boundary meant
        // for something else.
        *REPORTED.lock().unwrap() = None;
        assert!(was_reported("AA:BB:CC:DD:EE:FF"));

        // Once a discovery has run the set is authoritative. The reference
        // refuses a connect to anything not in reportedPeripherals; we accepted
        // any address, which makes the discovery filter decorative — knowing a
        // MAC was enough to reach hardware the user never chose.
        reset_reported();
        remember_reported("AA:BB:CC:DD:EE:FF");
        assert!(was_reported("AA:BB:CC:DD:EE:FF"));
        assert!(!was_reported("11:22:33:44:55:66"), "an unreported address must be refused");

        // A fresh scan invalidates the previous results.
        reset_reported();
        assert!(!was_reported("AA:BB:CC:DD:EE:FF"));
    }

    // ── message encoding, where our default was INVERTED ─────────────────

    #[test]
    fn an_absent_encoding_means_a_plain_string_not_base64() {
        // EncodingHelpers.decodeBuffer: no `encoding` key means the message is
        // a Unicode string and its UTF-8 bytes are sent. We defaulted to
        // base64, so "hello" was either a decode error or whatever bytes it
        // happened to decode to — wrong data written to a hub.
        let p = json!({"message": "hello"});
        assert_eq!(decode_message(&p).unwrap(), b"hello".to_vec());
    }

    #[test]
    fn base64_is_decoded_when_it_is_asked_for() {
        let p = json!({"message": "aGVsbG8=", "encoding": "base64"});
        assert_eq!(decode_message(&p).unwrap(), b"hello".to_vec());
    }

    #[test]
    fn an_unknown_encoding_is_refused_rather_than_guessed() {
        let p = json!({"message": "68656c6c6f", "encoding": "hex"});
        assert!(decode_message(&p).is_err());
    }

    #[test]
    fn a_missing_message_is_an_error() {
        assert!(decode_message(&json!({"encoding": "base64"})).is_err());
    }

    #[test]
    fn a_reply_carries_the_encoding_key_only_when_base64() {
        // encodeBuffer removes the key for a plain string, and a client reads
        // that difference to know how to interpret `message`.
        let b64 = encode_message(b"hello", Some("base64")).unwrap();
        assert_eq!(b64["message"], "aGVsbG8=");
        assert_eq!(b64["encoding"], "base64");

        let plain = encode_message(b"hello", None).unwrap();
        assert_eq!(plain["message"], "hello");
        assert!(plain.get("encoding").is_none(), "a plain string carries no encoding key");
    }

    #[test]
    fn non_utf8_bytes_cannot_be_returned_as_a_plain_string() {
        // Silently replacing them would hand back data that is not what the
        // characteristic holds.
        assert!(encode_message(&[0xFF, 0xFE], None).is_err());
        assert!(encode_message(&[0xFF, 0xFE], Some("base64")).is_ok());
    }

    // ── the GATT blocklist we did not have at all ────────────────────────

    const HID: &str = "00001812-0000-1000-8000-00805f9b34fb";
    const SERIAL_NUMBER: &str = "00002a25-0000-1000-8000-00805f9b34fb";
    const PRIVACY_FLAG: &str = "00002a02-0000-1000-8000-00805f9b34fb";
    const CCCD: &str = "00002902-0000-1000-8000-00805f9b34fb";

    #[test]
    fn hid_is_refused_for_reads_and_writes() {
        // Upstream's reason, verbatim: direct access to HID devices would let a
        // page become a keylogger. We had no blocklist, so this went through.
        let p = json!({"serviceId": HID, "characteristicId": "1234"});
        assert!(check_blocklist(&p, false).is_err(), "reading HID must be refused");
        assert!(check_blocklist(&p, true).is_err(), "writing HID must be refused");
    }

    #[test]
    fn the_serial_number_is_refused_because_it_is_a_tracking_id() {
        let p = json!({"characteristicId": SERIAL_NUMBER});
        assert!(check_blocklist(&p, false).is_err());
    }

    #[test]
    fn write_only_entries_still_allow_reading() {
        // The privacy flag and the CCCD are ExcludeWrites, not Exclude.
        // Blocking their reads too would break legitimate use — the blocklist
        // is meant to be exactly as wide as it needs to be.
        for uuid in [PRIVACY_FLAG, CCCD] {
            let p = json!({"characteristicId": uuid});
            assert!(check_blocklist(&p, false).is_ok(), "{uuid} should be readable");
            assert!(check_blocklist(&p, true).is_err(), "{uuid} must not be writable");
        }
    }

    #[test]
    fn a_blocked_characteristic_inside_an_allowed_service_is_still_refused() {
        // The reference checks BOTH ids. Checking only the service would let a
        // blocked characteristic through whenever its service is innocuous.
        let p = json!({"serviceId": "00001623-1212-efde-1623-785feabcd123",
                       "characteristicId": SERIAL_NUMBER});
        assert!(check_blocklist(&p, false).is_err());
    }

    #[test]
    fn ordinary_lego_endpoints_are_untouched() {
        // The blocklist must not cost us the hardware it exists to protect.
        let p = json!({"serviceId": "00001623-1212-efde-1623-785feabcd123",
                       "characteristicId": "00001624-1212-efde-1623-785feabcd123"});
        assert!(check_blocklist(&p, false).is_ok());
        assert!(check_blocklist(&p, true).is_ok());
    }

    #[test]
    fn a_short_uuid_form_is_blocked_too() {
        // Extensions may send "2a25" rather than the full form; parse_uuid
        // expands it, so the blocklist must catch it after expansion or the
        // block is trivially bypassed by writing the id differently.
        let p = json!({"characteristicId": "2a25"});
        assert!(check_blocklist(&p, false).is_err());
    }

    #[test]
    fn gdx_for_name_prefix_excludes_everything_else() {
        // scratch3_gdx_for filters on namePrefix alone. We honoured only
        // `services`, so with none given we scanned unfiltered and offered
        // every BLE device in range as a force sensor.
        let specs = parse_filters(&json!({"filters": [{"namePrefix": "GDX-FOR"}]})).unwrap();
        assert!(device_matches(&specs, &device("GDX-FOR 07100456", &[], &[])));
        assert!(!device_matches(&specs, &device("LEGO Move Hub", &[], &[])));
        assert!(!device_matches(&specs, &device("", &[], &[])), "a nameless device cannot match a name filter");
    }

    #[test]
    fn boost_manufacturer_data_distinguishes_lego_hubs() {
        // scratch3_boost filters on the LEGO service AND manufacturer data.
        // The service alone is shared with WeDo 2.0 and Powered Up, so honouring
        // only the service offered those as Boost hubs — connect, and every
        // block afterwards is plausible and wrong.
        let specs = parse_filters(&json!({"filters": [{
            "services": [LEGO_SERVICE],
            "manufacturerData": {"919": {"dataPrefix": [0x00, 0x40], "mask": [0x00, 0xFF]}}
        }]}))
        .unwrap();
        // 0x40 in the masked byte: a Boost Move Hub.
        assert!(device_matches(&specs, &device("LEGO Move Hub", &[LEGO_SERVICE], &[(919, &[0x00, 0x40, 0x01])])));
        // Same service, different hub type — must NOT match.
        assert!(!device_matches(&specs, &device("LEGO Hub", &[LEGO_SERVICE], &[(919, &[0x00, 0x41, 0x01])])));
        // Right service, no manufacturer data at all.
        assert!(!device_matches(&specs, &device("LEGO Hub", &[LEGO_SERVICE], &[])));
    }

    #[test]
    fn the_mask_selects_which_bytes_matter() {
        // mask 00 FF means byte 0 is ignored entirely and byte 1 must match.
        let specs = parse_filters(&json!({"filters": [{
            "manufacturerData": {"919": {"dataPrefix": [0x00, 0x40], "mask": [0x00, 0xFF]}}
        }]}))
        .unwrap();
        assert!(device_matches(&specs, &device("x", &[], &[(919, &[0xFF, 0x40])])), "byte 0 is masked out");
        assert!(!device_matches(&specs, &device("x", &[], &[(919, &[0x00, 0x00])])));
    }

    #[test]
    fn an_absent_mask_matches_every_prefix_byte() {
        let specs = parse_filters(&json!({"filters": [{
            "manufacturerData": {"919": {"dataPrefix": [0x00, 0x40]}}
        }]}))
        .unwrap();
        assert!(device_matches(&specs, &device("x", &[], &[(919, &[0x00, 0x40])])));
        assert!(!device_matches(&specs, &device("x", &[], &[(919, &[0x01, 0x40])])));
    }

    // ── the reference's own validation, which we did not have ─────────────

    #[test]
    fn filters_are_required_and_must_constrain_something() {
        assert!(parse_filters(&json!({})).is_err(), "missing filters");
        assert!(parse_filters(&json!({"filters": []})).is_err(), "empty filters array");
        assert!(parse_filters(&json!({"filters": [{}]})).is_err(), "a filter that constrains nothing");
        // Returning Ok here is what made a malformed request scan unfiltered.
    }

    #[test]
    fn a_mask_of_the_wrong_length_is_refused() {
        let r = parse_filters(&json!({"filters": [{
            "manufacturerData": {"919": {"dataPrefix": [0x00, 0x40], "mask": [0xFF]}}
        }]}));
        assert!(r.is_err(), "prefix and mask lengths must match");
    }

    #[test]
    fn manufacturer_data_needs_a_prefix() {
        let r = parse_filters(&json!({"filters": [{"manufacturerData": {"919": {}}}]}));
        assert!(r.is_err());
    }

    // ── general Web Bluetooth semantics ───────────────────────────────────

    #[test]
    fn required_services_must_all_be_present_not_merely_one() {
        let other = "0000180f-0000-1000-8000-00805f9b34fb";
        let specs = parse_filters(&json!({"filters": [{"services": [LEGO_SERVICE, other]}]})).unwrap();
        assert!(device_matches(&specs, &device("hub", &[LEGO_SERVICE, other], &[])));
        assert!(!device_matches(&specs, &device("hub", &[LEGO_SERVICE], &[])), "subset, not intersection");
    }

    #[test]
    fn a_device_matches_if_any_filter_matches() {
        let specs = parse_filters(&json!({"filters": [
            {"namePrefix": "GDX-FOR"},
            {"services": [LEGO_SERVICE]}
        ]}))
        .unwrap();
        assert!(device_matches(&specs, &device("GDX-FOR 1", &[], &[])));
        assert!(device_matches(&specs, &device("LEGO Move Hub", &[LEGO_SERVICE], &[])));
        assert!(!device_matches(&specs, &device("Some Speaker", &[], &[])));
    }

    #[test]
    fn an_exact_name_must_match_exactly() {
        let specs = parse_filters(&json!({"filters": [{"name": "LEGO Move Hub"}]})).unwrap();
        assert!(device_matches(&specs, &device("LEGO Move Hub", &[], &[])));
        assert!(!device_matches(&specs, &device("LEGO Move Hub 2", &[], &[])), "name is equality, not prefix");
    }

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
    fn decode_treats_an_absent_encoding_as_a_plain_string() {
        // This test used to assert the OPPOSITE — that an absent encoding
        // meant base64 — and cargo caught it the moment the behaviour was
        // corrected. It was pinning the bug: EncodingHelpers.decodeBuffer
        // treats no `encoding` as "the message is a Unicode string", and only
        // "base64" as base64. Keeping the old assertion would have made the
        // suite defend the defect against its own fix.
        let p = json!({ "message": "AQID" });
        assert_eq!(decode_message(&p).unwrap(), b"AQID".to_vec());
    }

    #[test]
    fn decode_rejects_missing_and_unknown_encoding() {
        assert!(decode_message(&json!({})).is_err());
        assert!(decode_message(&json!({ "message": "AQID", "encoding": "hex" })).is_err());
    }

    #[tokio::test]
    async fn a_failed_scan_tells_both_dialects() {
        // Our own web code needs the reason; the stock VM needs a method it
        // already understands, or it waits out its own timeout in silence.
        let (tx, mut rx) = mpsc::channel(4);
        scan_failed(&tx, "Bluetooth is switched off.").await;

        let first: Value = serde_json::from_str(&rx.recv().await.unwrap().into_text().unwrap()).unwrap();
        assert_eq!(first["method"], json!("discoverDidFail"));
        assert_eq!(first["params"]["message"], json!("Bluetooth is switched off."));

        let second: Value = serde_json::from_str(&rx.recv().await.unwrap().into_text().unwrap()).unwrap();
        assert_eq!(second["method"], json!("userDidNotPickPeripheral"));
    }

}
