// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//! Bounded decoder for the neutral `brick-state/v1` Renode stream.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub(crate) const MAX_BRICK_STATE_LINE_BYTES: usize = 256 * 1024;
const MAX_COLLECTION_ITEMS: usize = 16;
const MAX_CAPABILITIES: usize = 128;
const EV3_PIXELS: usize = 178 * 128;
const READ_BYTES: usize = 16 * 1024;
const IO_TIMEOUT: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrickTarget {
    pub(crate) board: String,
    pub(crate) firmware: String,
    pub(crate) transport: String,
    pub(crate) image_sha256: Option<String>,
    pub(crate) capabilities: Vec<String>,
    pub(crate) limitations: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrickStateSnapshot {
    pub(crate) schema_version: u32,
    #[serde(rename = "type")]
    pub(crate) message_type: String,
    pub(crate) seq: u64,
    pub(crate) clock_ns: u64,
    pub(crate) target: BrickTarget,
    pub(crate) lifecycle: serde_json::Value,
    pub(crate) ports: Vec<serde_json::Value>,
    pub(crate) motors: Vec<serde_json::Value>,
    pub(crate) sensors: Vec<serde_json::Value>,
    pub(crate) display: serde_json::Value,
    pub(crate) buttons: serde_json::Value,
    pub(crate) battery: serde_json::Value,
    pub(crate) power: serde_json::Value,
    pub(crate) imu: serde_json::Value,
    pub(crate) audio: serde_json::Value,
    pub(crate) storage: serde_json::Value,
    pub(crate) bluetooth: serde_json::Value,
}

#[derive(Default)]
pub(crate) struct BrickStateDecoder {
    last_seq: Option<u64>,
    identity: Option<(String, String, Option<String>)>,
    uart_generation: Option<u64>,
}

impl BrickStateDecoder {
    pub(crate) fn decode(&mut self, line: &[u8]) -> Result<BrickStateSnapshot, String> {
        if line.is_empty() || line.len() > MAX_BRICK_STATE_LINE_BYTES || line.contains(&b'\n') {
            return Err("brick-state frame exceeds its bounds".into());
        }
        let snapshot: BrickStateSnapshot = serde_json::from_slice(line)
            .map_err(|_| "brick-state frame is malformed".to_owned())?;
        if snapshot.schema_version != 1 || snapshot.message_type != "snapshot" {
            return Err("brick-state version or kind is unsupported".into());
        }
        if !matches!(snapshot.target.board.as_str(), "spike-prime" | "ev3")
            || snapshot.target.transport != "none"
            || snapshot.target.transport.len() > 32
        {
            return Err("brick-state identity is not a supported simulation".into());
        }
        let valid_firmware = if snapshot.target.board == "ev3" {
            snapshot.target.firmware == "brickwright-ev3-smoke"
        } else {
            matches!(
                snapshot.target.firmware.as_str(),
                "lego-prime-v2"
                    | "lego-prime-v3"
                    | "spike-nx"
                    | "brickwright-nuttx"
                    | "brickwright-arena-demo"
                    | "micropython-prime"
            )
        };
        if !valid_firmware {
            return Err("brick-state firmware identity is unsupported".into());
        }
        if snapshot.ports.len() > MAX_COLLECTION_ITEMS
            || snapshot.motors.len() > MAX_COLLECTION_ITEMS
            || snapshot.sensors.len() > MAX_COLLECTION_ITEMS
            || snapshot.target.capabilities.len() > MAX_CAPABILITIES
            || snapshot.target.limitations.len() > MAX_CAPABILITIES
        {
            return Err("brick-state collection exceeds its bounds".into());
        }
        if snapshot
            .target
            .capabilities
            .iter()
            .any(|value| value.len() > 64)
            || snapshot
                .target
                .limitations
                .iter()
                .any(|value| value.len() > 256)
            || snapshot
                .target
                .capabilities
                .iter()
                .collect::<BTreeSet<_>>()
                .len()
                != snapshot.target.capabilities.len()
        {
            return Err("brick-state metadata exceeds its bounds".into());
        }
        let pixels = snapshot
            .display
            .get("pixels")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| "brick-state display is malformed".to_owned())?;
        let display_width = snapshot
            .display
            .get("width")
            .and_then(serde_json::Value::as_u64);
        let display_height = snapshot
            .display
            .get("height")
            .and_then(serde_json::Value::as_u64);
        let valid_display = if snapshot.target.board == "ev3" {
            (display_width == Some(178)
                && display_height == Some(128)
                && pixels.len() == EV3_PIXELS
                && pixels
                    .iter()
                    .all(|value| value.as_u64().is_some_and(|v| v <= 255)))
                || (display_width == Some(0) && display_height == Some(0) && pixels.is_empty())
        } else {
            pixels.len() <= 4096
                && display_width.is_some_and(|value| value <= 64)
                && display_height.is_some_and(|value| value <= 64)
                && pixels.iter().all(serde_json::Value::is_number)
        };
        if !valid_display {
            return Err("brick-state display exceeds its bounds".into());
        }
        if !snapshot.lifecycle.is_object()
            || !snapshot.buttons.is_object()
            || !snapshot.power.is_object()
            || !snapshot.imu.is_object()
            || !snapshot.battery.is_object()
            || !snapshot.audio.is_object()
            || !snapshot.storage.is_object()
            || !snapshot.bluetooth.is_object()
            || snapshot
                .audio
                .get("active")
                .and_then(serde_json::Value::as_bool)
                .is_none()
            || snapshot
                .storage
                .get("ready")
                .and_then(serde_json::Value::as_bool)
                .is_none()
        {
            return Err("brick-state snapshot shape is malformed".into());
        }
        let micro = snapshot.target.firmware == "micropython-prime";
        let uart = snapshot.target.capabilities.iter().any(|cap| cap == "micropython-uart/v1");
        let uart_generation = if micro && uart && snapshot.target.image_sha256.is_some() {
            let metadata = &snapshot.lifecycle["micropythonUart"];
            if !metadata.as_object().is_some_and(|fields| fields.len() == 2)
                || !metadata["state"].as_str().is_some_and(|state| matches!(state, "ready" | "closed" | "faulted")) {
                return Err("brick-state UART metadata is malformed".into());
            }
            Some(metadata["generation"].as_u64().filter(|generation| (1..=9_007_199_254_740_991).contains(generation))
                .ok_or("brick-state UART metadata is malformed")?)
        } else {
            if micro || uart || snapshot.lifecycle.get("micropythonUart").is_some() {
                return Err("brick-state UART metadata is malformed".into());
            }
            None
        };
        if self.last_seq.is_some() && self.uart_generation != uart_generation {
            return Err("brick-state UART generation changed".into());
        }
        let deferred = snapshot.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage-deferred/v1");
        if (deferred && (snapshot.target.board != "spike-prime" || snapshot.target.firmware != "brickwright-nuttx"
            || !snapshot.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage/v1")))
            || (snapshot.lifecycle.get("nuttxProgramStorage").is_some() && !deferred)
            || !valid_storage_metadata(&snapshot.lifecycle) {
            return Err("brick-state storage metadata is malformed".into());
        }
        let checkpoint = snapshot.target.capabilities.iter().any(|cap| cap == "nuttx-flash-checkpoint/v1");
        if (checkpoint && (!deferred || snapshot.target.transport != "none" || snapshot.target.image_sha256.is_none()))
            || (snapshot.lifecycle.get("nuttxFlashCheckpoint").is_some() && !checkpoint)
            || !valid_flash_checkpoint(&snapshot.lifecycle) {
            return Err("brick-state flash checkpoint is malformed".into());
        }
        if let Some(digest) = &snapshot.target.image_sha256 {
            if digest.len() != 64
                || !digest
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                return Err("brick-state image digest is malformed".into());
            }
        }
        if self.last_seq.is_some_and(|last| snapshot.seq <= last) {
            return Err("brick-state frame was replayed or reordered".into());
        }
        let identity = (
            snapshot.target.board.clone(),
            snapshot.target.firmware.clone(),
            snapshot.target.image_sha256.clone(),
        );
        if self
            .identity
            .as_ref()
            .is_some_and(|prior| prior != &identity)
        {
            return Err("brick-state target changed within a session".into());
        }
        self.identity = Some(identity);
        self.uart_generation = uart_generation;
        self.last_seq = Some(snapshot.seq);
        Ok(snapshot)
    }
}

fn valid_storage_metadata(lifecycle: &serde_json::Value) -> bool {
    let Some(metadata) = lifecycle.get("nuttxProgramStorage") else { return true; };
    let Some(fields) = metadata.as_object() else { return false; };
    if fields.len() != 5 { return false; }
    let request = metadata["requestSeq"].as_u64();
    let reply = metadata["replySeq"].as_u64();
    if !request.is_some_and(|v| v > 0 && v <= u32::MAX as u64 && v % 2 == 0)
        || !reply.is_some_and(|v| v <= u32::MAX as u64 && v % 2 == 0)
        || !matches!(metadata["operation"].as_u64(), Some(8 | 9))
        || !metadata["programId"].as_u64().is_some_and(|v| v > 0 && v <= u32::MAX as u64)
        || metadata["pending"].as_bool() != Some(request != reply) { return false; }
    if request == reply {
        let Some(bytes) = lifecycle["nuttxProgramReply"].as_array() else { return false; };
        if bytes.len() != 20 || bytes.iter().any(|v| !v.as_u64().is_some_and(|v| v <= 255))
            || bytes[0].as_u64() != Some(0x71) || bytes[1].as_u64() != Some(1)
            || bytes[2].as_u64() != metadata["operation"].as_u64()
            || !bytes[3].as_u64().is_some_and(|v| v <= 5) { return false; }
        let id = (0..4).fold(0u64, |id, i| id | (bytes[4 + i].as_u64().unwrap() << (i * 8)));
        if Some(id) != metadata["programId"].as_u64() { return false; }
    }
    true
}

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
fn valid_flash_checkpoint(lifecycle: &serde_json::Value) -> bool {
    let Some(data) = lifecycle.get("nuttxFlashCheckpoint") else { return true; };
    let Some(fields) = data.as_object() else { return false; };
    if !(3..=4).contains(&fields.len())
        || fields.keys().any(|key| !matches!(key.as_str(), "requestSeq" | "programId" | "status" | "error"))
        || !data["requestSeq"].as_u64().is_some_and(|v| v > 0 && v <= u32::MAX as u64 && v % 2 == 0)
        || !data["programId"].as_u64().is_some_and(|v| v > 0 && v <= u32::MAX as u64)
        || !matches!(data["status"].as_str(), Some("pending" | "durable" | "failed")) { return false; }
    if fields.contains_key("error") && (data["status"] != "failed"
        || !data["error"].as_str().is_some_and(|v| v.len() <= 256)) { return false; }
    // LOAD and ordinary program packets may follow a durable SAVE. A current
    // SAVE, however, must refer to exactly this checkpoint generation and ID.
    let metadata = &lifecycle["nuttxProgramStorage"];
    if metadata["operation"] == 8 && (metadata["requestSeq"] != data["requestSeq"]
        || metadata["programId"] != data["programId"]) { return false; }
    true
}

pub(crate) struct BrickStateFeed {
    latest: Arc<Mutex<Option<BrickStateSnapshot>>>,
    healthy: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    stream: TcpStream,
    command_lock: Mutex<()>,
    reply: Arc<Mutex<Option<PendingCommand>>>,
    thread: Option<JoinHandle<()>>,
}

struct PendingCommand {
    request_id: String,
    seq: u64,
    result: Option<CommandResult>,
}

struct CommandResult {
    accepted: bool,
    data: Option<serde_json::Value>,
}

/// Decode only the terminal reply for the currently owned request. A fresh
/// snapshot cannot substitute for acknowledgment or command-specific data.
fn accept_command_result(
    value: &serde_json::Value,
    pending: &mut Option<PendingCommand>,
) -> Result<(), ()> {
    let fields = value.as_object().ok_or(())?;
    if !(5..=7).contains(&fields.len())
        || fields.keys().any(|key| !matches!(key.as_str(),
            "schemaVersion" | "type" | "requestId" | "seq" | "accepted" | "error" | "data"))
        || value["schemaVersion"].as_u64() != Some(1)
        || value["type"] != "result" {
        return Err(());
    }
    let owned = pending.as_mut().ok_or(())?;
    if value["requestId"].as_str() != Some(owned.request_id.as_str())
        || value["seq"].as_u64() != Some(owned.seq)
        || owned.result.is_some() {
        return Err(());
    }
    let accepted = value["accepted"].as_bool().ok_or(())?;
    if fields.contains_key("error") && (accepted ||
        !value["error"].as_str().is_some_and(|text| text.len() <= 1024)) {
        return Err(());
    }
    let data = fields.get("data");
    if let Some(data) = data {
        if !accepted || !data.is_object()
            || serde_json::to_vec(data).map_err(|_| ())?.len() > 32768 {
            return Err(());
        }
    }
    owned.result = Some(CommandResult {accepted, data: data.cloned()});
    Ok(())
}

impl BrickStateFeed {
    pub(crate) fn connect(endpoint: SocketAddr) -> Result<Self, String> {
        if !endpoint.ip().is_loopback() {
            return Err("brick-state endpoint must be loopback".into());
        }
        let stream = TcpStream::connect_timeout(&endpoint, Duration::from_secs(2))
            .map_err(|_| "brick-state endpoint unavailable".to_owned())?;
        stream
            .set_read_timeout(Some(IO_TIMEOUT))
            .map_err(|_| "brick-state endpoint unavailable".to_owned())?;
        stream
            .set_write_timeout(Some(IO_TIMEOUT))
            .map_err(|_| "brick-state endpoint unavailable".to_owned())?;
        let mut reader = stream
            .try_clone()
            .map_err(|_| "brick-state endpoint unavailable".to_owned())?;
        let latest = Arc::new(Mutex::new(None));
        let healthy = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(AtomicBool::new(false));
        let reply = Arc::new(Mutex::new(None));
        let latest_thread = Arc::clone(&latest);
        let healthy_thread = Arc::clone(&healthy);
        let stop_thread = Arc::clone(&stop);
        let reply_thread = Arc::clone(&reply);
        let thread = thread::spawn(move || {
            let mut decoder = BrickStateDecoder::default();
            let mut pending = Vec::new();
            let mut buffer = [0u8; READ_BYTES];
            while !stop_thread.load(Ordering::Acquire) {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        pending.extend_from_slice(&buffer[..count]);
                        if pending.len() > MAX_BRICK_STATE_LINE_BYTES + READ_BYTES {
                            break;
                        }
                        while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
                            let mut remainder = pending.split_off(newline + 1);
                            pending.truncate(newline);
                            let parsed = serde_json::from_slice::<serde_json::Value>(&pending).ok();
                            if parsed.as_ref().is_some_and(|value| value["type"] == "result") {
                                let accepted = reply_thread.lock().ok().is_some_and(|mut slot|
                                    accept_command_result(parsed.as_ref().unwrap(), &mut slot).is_ok());
                                if !accepted {
                                    healthy_thread.store(false, Ordering::Release);
                                    return;
                                }
                                pending.clear();
                                pending.append(&mut remainder);
                                continue;
                            }
                            let result = decoder.decode(&pending);
                            pending.clear();
                            pending.append(&mut remainder);
                            match result {
                                Ok(snapshot) => {
                                    if let Ok(mut slot) = latest_thread.lock() {
                                        *slot = Some(snapshot);
                                        healthy_thread.store(true, Ordering::Release);
                                    } else {
                                        healthy_thread.store(false, Ordering::Release);
                                        return;
                                    }
                                }
                                Err(_) => {
                                    healthy_thread.store(false, Ordering::Release);
                                    return;
                                }
                            }
                        }
                        if pending.len() > MAX_BRICK_STATE_LINE_BYTES {
                            break;
                        }
                    }
                    Err(error)
                        if matches!(
                            error.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) => {}
                    Err(_) => break,
                }
            }
            healthy_thread.store(false, Ordering::Release);
        });
        Ok(Self {
            latest,
            healthy,
            stop,
            stream,
            command_lock: Mutex::new(()),
            reply,
            thread: Some(thread),
        })
    }

    pub(crate) fn latest(&self) -> Result<BrickStateSnapshot, String> {
        if self.stop.load(Ordering::Acquire) || !self.healthy.load(Ordering::Acquire) {
            return Err("brick-state snapshot unavailable".into());
        }
        self.latest
            .lock()
            .map_err(|_| "brick-state snapshot unavailable".to_owned())?
            .clone()
            .ok_or_else(|| "brick-state snapshot unavailable".to_owned())
    }

    /// Request one fresh paused-model observation over the existing bounded
    /// loopback stream. No arbitrary monitor or program text can be sent.
    pub(crate) fn sample(&self) -> Result<BrickStateSnapshot, String> {
        self.command("state.sample", serde_json::json!({}))
    }

    pub(crate) fn command(
        &self,
        name: &str,
        arguments: serde_json::Value,
    ) -> Result<BrickStateSnapshot, String> {
        self.command_with_result(name, arguments).map(|(snapshot, _)| snapshot)
    }

    /// Closed commands only. Returned data belongs to the exact request, while
    /// the snapshot remains the shared model's fresh observation.
    pub(crate) fn command_with_result(
        &self,
        name: &str,
        arguments: serde_json::Value,
    ) -> Result<(BrickStateSnapshot, Option<serde_json::Value>), String> {
        let uart_request = if name.starts_with("micropython.uart.") {
            Some(crate::spike_program_uart_contract::parse_request(name, &arguments)
                .map_err(|_| "brick-state UART input is unsupported")?)
        } else { None };
        match name {
            "micropython.uart.read" | "micropython.uart.write" | "micropython.uart.close" if uart_request.is_some() => {}
            "nuttx.program.packet" if crate::arena_inputs::valid_nuttx_packet(&arguments) => {}
            "nuttx.program.storage.submit" if crate::arena_inputs::valid_nuttx_storage_submit(&arguments) => {}
            "arena.inputs" if crate::arena_inputs::valid(&arguments) => {}
            "arena.program.load" if crate::arena_inputs::valid_program(&arguments) => {}
            "state.sample" if arguments.as_object().is_some_and(|args| args.is_empty()) => {}
            "ev3.button.set"
                if arguments.as_object().is_some_and(|args| args.len() == 2)
                    && arguments["button"].as_str().is_some_and(|name| {
                        matches!(name, "center" | "left" | "back" | "right" | "down" | "up")
                    })
                    && arguments["pressed"].is_boolean() => {}
            "ev3.analog.set-channel"
                if arguments.as_object().is_some_and(|args| args.len() == 2)
                    && arguments["channel"].as_u64().is_some_and(|v| v <= 15)
                    && arguments["value"].as_u64().is_some_and(|v| v <= 1023) => {}
            _ => return Err("brick-state input is unsupported".into()),
        }
        let _lock = self
            .command_lock
            .lock()
            .map_err(|_| "brick-state command unavailable".to_owned())?;
        let prior = self.latest()?;
        let target_ok = match name {
            "micropython.uart.read" | "micropython.uart.write" | "micropython.uart.close" => {
                prior.target.board == "spike-prime" && prior.target.transport == "none"
                    && prior.target.firmware == "micropython-prime" && prior.target.image_sha256.is_some()
                    && prior.target.capabilities.iter().any(|cap| cap == "micropython-uart/v1")
                    && prior.lifecycle["micropythonUart"]["state"] == "ready"
                    && prior.lifecycle["micropythonUart"]["generation"].as_u64() == uart_request.as_ref().map(|request| request.generation())
            }
            "state.sample" => true,
            "nuttx.program.packet" | "nuttx.program.storage.submit" => prior.target.board == "spike-prime"
                && prior.target.transport == "none"
                && prior.target.firmware == "brickwright-nuttx"
                && prior.target.capabilities.iter().any(|cap| cap == "nuttx-program/v1")
                && (name != "nuttx.program.storage.submit" || prior.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage-deferred/v1"))
                && (arguments["bytes"][2].as_u64().is_some_and(|op| op < 8)
                    || prior.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage/v1")),
            "arena.inputs" | "arena.program.load" => {
                prior.target.board == "spike-prime"
                    && prior.target.transport == "none"
                    && (prior.target.firmware == "brickwright-arena-demo" ||
                        (name == "arena.inputs" && matches!(prior.target.firmware.as_str(), "brickwright-nuttx" | "micropython-prime")))
                    && prior.target.capabilities.iter().any(|cap| {
                        cap == if name == "arena.program.load" {
                            "arena-program/v1"
                        } else {
                            "arena-inputs/v1"
                        }
                    })
            }
            _ => prior.target.board == "ev3",
        };
        if !target_ok {
            return Err("brick-state input target mismatch".into());
        }
        let request_id = format!("input-{}", prior.seq);
        let command = serde_json::json!({"schemaVersion":1,"type":"command",
            "requestId":request_id,"expectedSeq":prior.seq,
            "command":name,"arguments":arguments});
        let mut wire = serde_json::to_vec(&command)
            .map_err(|_| "brick-state command unavailable".to_owned())?;
        wire.push(b'\n');
        *self.reply.lock().map_err(|_| "brick-state command unavailable")? =
            Some(PendingCommand {request_id, seq: prior.seq, result: None});
        let outcome = (|| {
            let mut stream = &self.stream;
            stream.write_all(&wire).map_err(|_| "brick-state command unavailable".to_owned())?;
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                let current = self.latest()?;
                let mut slot = self.reply.lock().map_err(|_| "brick-state command unavailable")?;
                if let Some(result) = slot.as_mut().and_then(|owned| owned.result.as_mut()) {
                    if !result.accepted {
                        // Do not expose backend error text or continue after a
                        // rejected request with potentially partial side effects.
                        return Err("brick-state command rejected".into());
                    }
                    if current.seq > prior.seq {
                        if let Some(request) = &uart_request {
                            let data = result.data.as_ref().ok_or("brick-state UART reply unavailable")?;
                            crate::spike_program_uart_contract::parse_reply(request, data)
                                .map_err(|_| "brick-state UART reply unavailable")?;
                        }
                        return Ok((current, result.data.take()));
                    }
                }
                drop(slot);
                thread::sleep(Duration::from_millis(5));
            }
            Err("brick-state command timed out".into())
        })();
        if let Ok(mut slot) = self.reply.lock() { *slot = None; }
        if outcome.is_err() {
            self.stop.store(true, Ordering::Release);
            self.healthy.store(false, Ordering::Release);
            let _ = self.stream.shutdown(Shutdown::Both);
        }
        outcome
    }

    pub(crate) fn wait_ready(&self, timeout: Duration) -> Result<(), String> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if self.latest().is_ok() {
                return Ok(());
            }
            thread::sleep(Duration::from_millis(5));
        }
        Err("brick-state snapshot unavailable".into())
    }
}

impl Drop for BrickStateFeed {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        let _ = self.stream.shutdown(Shutdown::Both);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::{Ipv4Addr, TcpListener};

    fn micro_frame(seq: u64) -> serde_json::Value {
        let mut value: serde_json::Value = serde_json::from_str(&frame(seq)).unwrap();
        value["target"]["firmware"] = "micropython-prime".into();
        value["target"]["imageSha256"] = "a".repeat(64).into();
        value["target"]["capabilities"] = serde_json::json!(["micropython-uart/v1"]);
        value["lifecycle"]["micropythonUart"] = serde_json::json!({"generation":7,"state":"ready"});
        value
    }

    #[test]
    fn micro_identity_requires_bound_uart_metadata_and_stable_generation() {
        let valid = micro_frame(0);
        BrickStateDecoder::default().decode(&serde_json::to_vec(&valid).unwrap()).unwrap();
        for (path, value) in [
            (vec!["target","firmware"],serde_json::json!("brickwright-nuttx")),
            (vec!["target","imageSha256"],serde_json::Value::Null),
            (vec!["target","capabilities"],serde_json::json!([])),
            (vec!["lifecycle","micropythonUart","generation"],serde_json::json!(0)),
            (vec!["lifecycle","micropythonUart","generation"],serde_json::json!(7.0)),
            (vec!["lifecycle","micropythonUart","state"],serde_json::json!("unknown")),
            (vec!["lifecycle","micropythonUart","extra"],serde_json::json!(true)),
        ] {
            let mut bad = valid.clone();
            let mut field = &mut bad;
            for key in path { field = &mut field[key]; }
            *field = value;
            assert!(BrickStateDecoder::default().decode(&serde_json::to_vec(&bad).unwrap()).is_err());
        }
        let mut decoder = BrickStateDecoder::default();
        decoder.decode(&serde_json::to_vec(&valid).unwrap()).unwrap();
        let mut changed = micro_frame(1);
        changed["lifecycle"]["micropythonUart"]["generation"] = 8.into();
        assert!(decoder.decode(&serde_json::to_vec(&changed).unwrap()).is_err());
    }

    #[test]
    fn correlated_micro_reply_data_is_validated_before_completion() {
        for data in [serde_json::json!({"generation":7,"bytes":[42]}),
                     serde_json::json!({"generation":8,"bytes":[]}),
                     serde_json::json!({"generation":7,"bytes":[42,43]})] {
            let expected = data == serde_json::json!({"generation":7,"bytes":[42]});
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST,0)).unwrap();
            let endpoint = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut stream,_) = listener.accept().unwrap();
                stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                writeln!(stream,"{}",micro_frame(0)).unwrap();
                let command = read_command(&mut stream);
                assert_eq!(command["command"],"micropython.uart.read");
                writeln!(stream,"{}",serde_json::json!({"schemaVersion":1,"type":"result",
                    "requestId":command["requestId"],"seq":0,"accepted":true,"data":data})).unwrap();
                writeln!(stream,"{}",micro_frame(1)).unwrap();
                thread::sleep(Duration::from_millis(100));
            });
            let feed = BrickStateFeed::connect(endpoint).unwrap();
            feed.wait_ready(Duration::from_secs(2)).unwrap();
            assert!(feed.command_with_result("micropython.uart.read",serde_json::json!({"generation":8,"maxBytes":1})).is_err());
            assert!(feed.latest().is_ok(),"wrong caller generation must fail before sending");
            let result = feed.command_with_result("micropython.uart.read",serde_json::json!({"generation":7,"maxBytes":1}));
            assert_eq!(result.is_ok(),expected);
            if !expected { assert!(feed.latest().is_err(),"malformed post-send reply must invalidate the feed"); }
            server.join().unwrap();
        }
    }

    fn read_command(stream: &mut TcpStream) -> serde_json::Value {
        let mut bytes = Vec::new();
        loop {
            let mut byte = [0];
            stream.read_exact(&mut byte).unwrap();
            if byte[0] == b'\n' { break; }
            bytes.push(byte[0]);
            assert!(bytes.len() <= 1024);
        }
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn results_require_exact_owned_request_and_bounded_closed_envelope() {
        let valid = serde_json::json!({"schemaVersion":1,"type":"result","requestId":"input-4",
            "seq":4,"accepted":true,"data":{"generation":7,"bytes":[0,4,255]}});
        let pending = || Some(PendingCommand {request_id:"input-4".into(),seq:4,result:None});
        let mut slot = pending();
        accept_command_result(&valid, &mut slot).unwrap();
        assert_eq!(slot.as_ref().unwrap().result.as_ref().unwrap().data, Some(valid["data"].clone()));
        assert!(accept_command_result(&valid, &mut slot).is_err());
        assert!(accept_command_result(&valid, &mut None).is_err());
        for (key, value) in [("requestId",serde_json::json!("input-5")), ("seq",serde_json::json!(5)),
            ("schemaVersion",serde_json::json!(2)), ("accepted",serde_json::json!(1)),
            ("extra",serde_json::json!(true)), ("error",serde_json::json!("unexpected")),
            ("data",serde_json::json!([1,2,3])),
            ("data",serde_json::json!({"bytes":"x".repeat(32768)}))] {
            let mut bad = valid.clone(); bad[key] = value;
            assert!(accept_command_result(&bad, &mut pending()).is_err(), "invalid field {key}");
        }
        let rejected = serde_json::json!({"schemaVersion":1,"type":"result","requestId":"input-4",
            "seq":4,"accepted":false,"error":"bounded private diagnostic"});
        let mut slot = pending();
        accept_command_result(&rejected, &mut slot).unwrap();
        assert!(!slot.unwrap().result.unwrap().accepted);
    }

    #[test]
    fn fresh_snapshot_waits_for_exact_reply_and_preserves_fragmented_data() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST,0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let (sent, observed) = std::sync::mpsc::channel();
        let (release, held) = std::sync::mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream,_) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            writeln!(stream,"{}",frame(0)).unwrap();
            let command = read_command(&mut stream);
            writeln!(stream,"{}",frame(1)).unwrap();
            sent.send(()).unwrap(); held.recv_timeout(Duration::from_secs(2)).unwrap();
            let wire = format!("{}\n",serde_json::json!({"schemaVersion":1,"type":"result",
                "requestId":command["requestId"],"seq":0,"accepted":true,
                "data":{"generation":7,"bytes":[0,4,255]}}));
            for chunk in wire.as_bytes().chunks(3) { stream.write_all(chunk).unwrap(); }
            thread::sleep(Duration::from_millis(100));
        });
        let feed = Arc::new(BrickStateFeed::connect(endpoint).unwrap());
        feed.wait_ready(Duration::from_secs(2)).unwrap();
        let owned = Arc::clone(&feed);
        let (finished, completion) = std::sync::mpsc::channel();
        let command = thread::spawn(move || finished.send(owned.command_with_result("state.sample",serde_json::json!({}))).unwrap());
        observed.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(matches!(completion.recv_timeout(Duration::from_millis(30)),Err(std::sync::mpsc::RecvTimeoutError::Timeout)),
            "a snapshot alone completed the command");
        release.send(()).unwrap();
        let (snapshot,data) = completion.recv_timeout(Duration::from_secs(2)).unwrap().unwrap();
        assert_eq!(snapshot.seq,1);
        assert_eq!(data,Some(serde_json::json!({"generation":7,"bytes":[0,4,255]})));
        command.join().unwrap(); server.join().unwrap();
    }

    #[test]
    fn rejected_reply_cannot_succeed_via_a_fresh_snapshot_or_expose_backend_error() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST,0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream,_) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            writeln!(stream,"{}",frame(0)).unwrap();
            let command = read_command(&mut stream);
            writeln!(stream,"{}",frame(1)).unwrap();
            thread::sleep(Duration::from_millis(30));
            writeln!(stream,"{}",serde_json::json!({"schemaVersion":1,"type":"result",
                "requestId":command["requestId"],"seq":0,"accepted":false,
                "error":"private backend diagnostic /private/synthetic-file"})).unwrap();
            thread::sleep(Duration::from_millis(100));
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();
        feed.wait_ready(Duration::from_secs(2)).unwrap();
        assert_eq!(feed.sample().unwrap_err(),"brick-state command rejected");
        assert!(feed.latest().is_err());
        assert!(feed.sample().is_err());
        server.join().unwrap();
    }

    fn frame(seq: u64) -> String {
        format!(
            r#"{{"schemaVersion":1,"type":"snapshot","seq":{seq},"clockNs":42,"target":{{"board":"spike-prime","firmware":"brickwright-nuttx","transport":"none","imageSha256":null,"capabilities":[],"limitations":[]}},"lifecycle":{{"phase":"ready","generation":1}},"ports":[],"motors":[],"sensors":[],"display":{{"width":5,"height":5,"pixels":[]}},"buttons":{{}},"battery":{{"percent":100}},"power":{{"state":"on"}},"imu":{{"acceleration":{{"x":0,"y":0,"z":0}},"angularVelocity":{{"x":0,"y":0,"z":0}}}},"audio":{{"active":false}},"storage":{{"ready":true}},"bluetooth":{{"state":"modeled","transport":"none"}}}}"#
        )
    }

    #[test]
    fn storage_metadata_requires_bounded_coherent_sequences_and_matching_completion() {
        let mut lifecycle = serde_json::json!({"nuttxProgramStorage": {
            "requestSeq": 12, "replySeq": 10, "operation": 8, "programId": 1, "pending": true
        }, "nuttxProgramReply": [113,1,9,1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]});
        assert!(super::valid_storage_metadata(&lifecycle)); // prior reply is intentionally ignored
        for (field, value) in [("requestSeq", serde_json::json!(3)), ("replySeq", serde_json::json!(4294967296u64)),
            ("pending", serde_json::json!(false)), ("programId", serde_json::json!(0))] {
            let mut bad = lifecycle.clone();bad["nuttxProgramStorage"][field] = value;
            assert!(!super::valid_storage_metadata(&bad));
        }
        lifecycle["nuttxProgramStorage"]["replySeq"] = serde_json::json!(12);
        lifecycle["nuttxProgramStorage"]["pending"] = serde_json::json!(false);
        assert!(!super::valid_storage_metadata(&lifecycle));
        lifecycle["nuttxProgramReply"][2] = serde_json::json!(8);
        assert!(!super::valid_storage_metadata(&lifecycle));
        lifecycle["nuttxProgramReply"][4] = serde_json::json!(1);
        assert!(super::valid_storage_metadata(&lifecycle));
        lifecycle["nuttxProgramReply"][8] = serde_json::json!(256);
        assert!(!super::valid_storage_metadata(&lifecycle));
    }

    #[test]
    fn host_checkpoint_rejects_stale_ids_shapes_and_unknown_status() {
        let lifecycle = serde_json::json!({"nuttxProgramStorage": {"requestSeq": 12, "programId": 1, "operation": 8},
            "nuttxFlashCheckpoint": {"requestSeq": 12, "programId": 1, "status": "pending"}});
        assert!(valid_flash_checkpoint(&lifecycle));
        for (field, value) in [("requestSeq", serde_json::json!(10)), ("programId", serde_json::json!(2)),
            ("status", serde_json::json!("exported")), ("error", serde_json::json!("unexpected")),
            ("extra", serde_json::json!(true))] {
            let mut bad = lifecycle.clone(); bad["nuttxFlashCheckpoint"][field] = value;
            assert!(!valid_flash_checkpoint(&bad));
        }
        let mut load = lifecycle;
        load["nuttxProgramStorage"]["operation"] = serde_json::json!(9);
        load["nuttxProgramStorage"]["requestSeq"] = serde_json::json!(14);
        load["nuttxFlashCheckpoint"]["status"] = serde_json::json!("durable");
        assert!(valid_flash_checkpoint(&load));
        load["nuttxFlashCheckpoint"]["status"] = serde_json::json!("failed");
        load["nuttxFlashCheckpoint"]["error"] = serde_json::json!("previous checkpoint retained");
        assert!(valid_flash_checkpoint(&load));
    }

    #[test]
    fn accepts_monotonic_bounded_prime_snapshots() {
        let mut decoder = BrickStateDecoder::default();
        assert_eq!(decoder.decode(frame(0).as_bytes()).unwrap().seq, 0);
        assert_eq!(decoder.decode(frame(1).as_bytes()).unwrap().clock_ns, 42);
    }

    #[test]
    fn accepts_full_ev3_frame_and_rejects_cross_target_or_malformed_pixels() {
        let mut value: serde_json::Value = serde_json::from_str(&frame(0)).unwrap();
        value["target"]["board"] = "ev3".into();
        value["target"]["firmware"] = "brickwright-ev3-smoke".into();
        value["display"] =
            serde_json::json!({"width":178,"height":128,"pixels":vec![255;EV3_PIXELS]});
        assert!(BrickStateDecoder::default()
            .decode(&serde_json::to_vec(&value).unwrap())
            .is_ok());
        value["display"]["pixels"][0] = 256.into();
        assert!(BrickStateDecoder::default()
            .decode(&serde_json::to_vec(&value).unwrap())
            .is_err());
        value["display"]["pixels"][0] = 0.5.into();
        assert!(BrickStateDecoder::default()
            .decode(&serde_json::to_vec(&value).unwrap())
            .is_err());
        value["display"]["pixels"][0] = 0.into();
        value["display"]["width"] = 179.into();
        assert!(BrickStateDecoder::default()
            .decode(&serde_json::to_vec(&value).unwrap())
            .is_err());
        value["target"]["board"] = "spike-prime".into();
        assert!(BrickStateDecoder::default()
            .decode(&serde_json::to_vec(&value).unwrap())
            .is_err());
    }

    #[test]
    fn target_identity_cannot_change_midstream() {
        let mut decoder = BrickStateDecoder::default();
        decoder.decode(frame(0).as_bytes()).unwrap();
        assert!(decoder
            .decode(
                frame(1)
                    .replace("brickwright-nuttx", "unsupported-prime")
                    .as_bytes()
            )
            .is_err());
        assert_eq!(decoder.decode(frame(1).as_bytes()).unwrap().seq, 1);
    }

    #[test]
    fn ev3_sample_handles_fragmented_result_and_refreshes_actual_snapshot() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let ev3_frame = |seq| {
                frame(seq)
                    .replace("spike-prime", "ev3")
                    .replace("brickwright-nuttx", "brickwright-ev3-smoke")
                    .replace("\"width\":5,\"height\":5", "\"width\":0,\"height\":0")
            };
            stream
                .write_all(format!("{}\n", ev3_frame(0)).as_bytes())
                .unwrap();
            let mut request = Vec::new();
            loop {
                let mut byte = [0];
                stream.read_exact(&mut byte).unwrap();
                if byte[0] == b'\n' {
                    break;
                }
                request.push(byte[0]);
                assert!(request.len() <= 1024);
            }
            let command: serde_json::Value = serde_json::from_slice(&request).unwrap();
            assert_eq!(command["command"], "state.sample");
            assert_eq!(command["expectedSeq"], 0);
            let reply = format!("{{\"schemaVersion\":1,\"type\":\"result\",\"accepted\":true,\"seq\":0,\"requestId\":\"input-0\"}}\n{}\n", ev3_frame(1));
            for chunk in reply.as_bytes().chunks(13) {
                stream.write_all(chunk).unwrap();
            }
            thread::sleep(Duration::from_millis(100));
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();
        feed.wait_ready(Duration::from_secs(2)).unwrap();
        assert_eq!(feed.sample().unwrap().seq, 1);
        assert!(feed.command("host.shell", serde_json::json!({})).is_err());
        server.join().unwrap();
    }

    #[test]
    fn deferred_storage_submission_returns_pending_then_sampled_completion() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut snapshot: serde_json::Value = serde_json::from_str(&frame(0)).unwrap();
            snapshot["target"]["capabilities"] = serde_json::json!([
                "nuttx-program/v1", "nuttx-program-storage/v1", "nuttx-program-storage-deferred/v1"]);
            writeln!(stream, "{snapshot}").unwrap();
            for (seq, expected) in [(1, "nuttx.program.storage.submit"), (2, "state.sample")] {
                let mut wire = Vec::new();let mut byte = [0];
                loop { stream.read_exact(&mut byte).unwrap();if byte[0] == b'\n' { break; }wire.push(byte[0]);assert!(wire.len() <= 1024); }
                let command: serde_json::Value = serde_json::from_slice(&wire).unwrap();
                assert_eq!(command["command"], expected);
                if seq == 1 { assert_eq!(command["arguments"], serde_json::json!({"bytes":[112,1,8,0,1,0,0,0]})); }
                snapshot["seq"] = serde_json::json!(seq);
                snapshot["lifecycle"]["nuttxProgramStorage"] = serde_json::json!({
                    "requestSeq": 12, "replySeq": if seq == 1 {10} else {12}, "operation": 8, "programId": 1, "pending": seq == 1});
                if seq == 2 { snapshot["lifecycle"]["nuttxProgramReply"] = serde_json::json!([113,1,8,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]); }
                writeln!(stream, "{}", serde_json::json!({"schemaVersion":1,"type":"result","accepted":true,
                    "seq":seq-1,"requestId":format!("input-{}",seq-1)})).unwrap();
                writeln!(stream, "{snapshot}").unwrap();
            }
            thread::sleep(Duration::from_millis(100));
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();feed.wait_ready(Duration::from_secs(2)).unwrap();
        let pending = feed.command("nuttx.program.storage.submit", serde_json::json!({"bytes":[112,1,8,0,1,0,0,0]})).unwrap();
        assert_eq!(pending.lifecycle["nuttxProgramStorage"]["pending"], true);
        assert_eq!(feed.sample().unwrap().lifecycle["nuttxProgramStorage"]["pending"], false);
        server.join().unwrap();
    }

    #[test]
    fn synchronous_storage_capability_does_not_authorize_deferred_submission() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let old = frame(0).replace("\"capabilities\":[]", "\"capabilities\":[\"nuttx-program/v1\",\"nuttx-program-storage/v1\"]");
            writeln!(stream, "{old}").unwrap();let mut byte = [0];
            match stream.read(&mut byte) {
                Ok(0) => {}, Err(error) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {},
                other => panic!("deferred request escaped capability gate: {other:?}"),
            }
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();feed.wait_ready(Duration::from_secs(2)).unwrap();
        assert_eq!(feed.command("nuttx.program.storage.submit", serde_json::json!({"bytes":[112,1,8,0,1,0,0,0]})).unwrap_err(), "brick-state input target mismatch");
        drop(feed);server.join().unwrap();
    }

    #[test]
    fn older_nuttx_capability_refuses_storage_before_writing_to_backend() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let old = frame(0).replace("\"capabilities\":[]", "\"capabilities\":[\"nuttx-program/v1\"]");
            stream.write_all(format!("{old}\n").as_bytes()).unwrap();
            let mut byte = [0];
            match stream.read(&mut byte) {
                Ok(0) => {},
                Err(error) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {},
                other => panic!("storage request escaped capability gate: {other:?}"),
            }
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();
        feed.wait_ready(Duration::from_secs(2)).unwrap();
        for operation in [8, 9] {
            assert_eq!(feed.command("nuttx.program.packet", serde_json::json!({"bytes":[112,1,operation,0,1,0,0,0]})).unwrap_err(),
                "brick-state input target mismatch");
            assert_eq!(feed.command("nuttx.program.storage.submit", serde_json::json!({"bytes":[112,1,operation,0,1,0,0,0]})).unwrap_err(),
                "brick-state input target mismatch");
        }
        drop(feed);
        server.join().unwrap();
    }

    #[test]
    fn rejects_replay_wrong_identity_version_and_oversize() {
        let mut decoder = BrickStateDecoder::default();
        decoder.decode(frame(2).as_bytes()).unwrap();
        assert!(decoder.decode(frame(2).as_bytes()).is_err());
        assert!(BrickStateDecoder::default()
            .decode(frame(0).replace("\"spike-prime\"", "\"ev3\"").as_bytes())
            .is_err());
        assert!(BrickStateDecoder::default()
            .decode(
                frame(0)
                    .replace("\"schemaVersion\":1", "\"schemaVersion\":2")
                    .as_bytes()
            )
            .is_err());
        assert!(BrickStateDecoder::default()
            .decode(
                frame(0)
                    .replace("\"type\":\"snapshot\"", "\"kind\":\"snapshot\"")
                    .as_bytes()
            )
            .is_err());
        assert!(BrickStateDecoder::default()
            .decode(&vec![b'x'; MAX_BRICK_STATE_LINE_BYTES + 1])
            .is_err());
    }

    #[test]
    fn feed_accepts_fragmented_monotonic_lines_and_fails_closed_on_replay() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let endpoint = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let first = format!("{}\n", frame(0));
            stream.write_all(&first.as_bytes()[..17]).unwrap();
            stream.write_all(&first.as_bytes()[17..]).unwrap();
            stream
                .write_all(format!("{}\n", frame(1)).as_bytes())
                .unwrap();
            thread::sleep(Duration::from_millis(25));
            stream
                .write_all(format!("{}\n", frame(1)).as_bytes())
                .unwrap();
        });
        let feed = BrickStateFeed::connect(endpoint).unwrap();
        let deadline = Instant::now() + Duration::from_secs(1);
        while feed.latest().map(|state| state.seq) != Ok(1) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(feed.latest().unwrap().seq, 1);
        server.join().unwrap();
        let deadline = Instant::now() + Duration::from_secs(1);
        while feed.latest().is_ok() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        assert!(feed.latest().is_err());
    }
}
