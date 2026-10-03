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
        let deferred = snapshot.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage-deferred/v1");
        if (deferred && (snapshot.target.board != "spike-prime" || snapshot.target.firmware != "brickwright-nuttx"
            || !snapshot.target.capabilities.iter().any(|cap| cap == "nuttx-program-storage/v1")))
            || (snapshot.lifecycle.get("nuttxProgramStorage").is_some() && !deferred)
            || !valid_storage_metadata(&snapshot.lifecycle) {
            return Err("brick-state storage metadata is malformed".into());
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

pub(crate) struct BrickStateFeed {
    latest: Arc<Mutex<Option<BrickStateSnapshot>>>,
    healthy: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    stream: TcpStream,
    command_lock: Mutex<()>,
    thread: Option<JoinHandle<()>>,
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
        let latest_thread = Arc::clone(&latest);
        let healthy_thread = Arc::clone(&healthy);
        let stop_thread = Arc::clone(&stop);
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
                            let is_result = serde_json::from_slice::<serde_json::Value>(&pending)
                                .ok()
                                .is_some_and(|value| {
                                    value["schemaVersion"] == 1
                                        && value["type"] == "result"
                                        && value["accepted"].as_bool() == Some(true)
                                        && value["seq"].as_u64() == decoder.last_seq
                                        && value["requestId"].as_str().is_some_and(|request| {
                                            decoder.last_seq.is_some_and(|seq| {
                                                request == format!("input-{seq}")
                                            })
                                        })
                                });
                            if is_result {
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
            thread: Some(thread),
        })
    }

    pub(crate) fn latest(&self) -> Result<BrickStateSnapshot, String> {
        if !self.healthy.load(Ordering::Acquire) {
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
        match name {
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
                        (name == "arena.inputs" && prior.target.firmware == "brickwright-nuttx"))
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
        let command = serde_json::json!({"schemaVersion":1,"type":"command",
            "requestId":format!("input-{}",prior.seq),"expectedSeq":prior.seq,
            "command":name,"arguments":arguments});
        let mut wire = serde_json::to_vec(&command)
            .map_err(|_| "brick-state command unavailable".to_owned())?;
        wire.push(b'\n');
        let mut stream = &self.stream;
        stream
            .write_all(&wire)
            .map_err(|_| "brick-state command unavailable".to_owned())?;
        let deadline = Instant::now() + Duration::from_secs(2);
        while Instant::now() < deadline {
            let current = self.latest()?;
            if current.seq > prior.seq {
                return Ok(current);
            }
            thread::sleep(Duration::from_millis(5));
        }
        Err("brick-state sample timed out".into())
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
