//! Bounded decoder for the neutral `brick-state/v1` Renode stream.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::io::Read;
use std::net::{Shutdown, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub(crate) const MAX_BRICK_STATE_LINE_BYTES: usize = 256 * 1024;
const MAX_COLLECTION_ITEMS: usize = 16;
const MAX_CAPABILITIES: usize = 128;
const MAX_PIXELS: usize = 4096;
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
        if snapshot.target.board != "spike-prime"
            || snapshot.target.transport != "none"
            || snapshot.target.transport.len() > 32
        {
            return Err("brick-state identity is not SPIKE Prime simulation".into());
        }
        if !matches!(
            snapshot.target.firmware.as_str(),
            "lego-prime-v2" | "lego-prime-v3" | "pybricks-prime" | "spike-nx" | "brickwright-nuttx"
        ) {
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
        if pixels.len() > MAX_PIXELS
            || !display_width.is_some_and(|value| value <= 64)
            || !display_height.is_some_and(|value| value <= 64)
            || pixels.iter().any(|value| !value.is_number())
        {
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
        self.last_seq = Some(snapshot.seq);
        Ok(snapshot)
    }
}

pub(crate) struct BrickStateFeed {
    latest: Arc<Mutex<Option<BrickStateSnapshot>>>,
    healthy: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    stream: TcpStream,
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
    fn accepts_monotonic_bounded_prime_snapshots() {
        let mut decoder = BrickStateDecoder::default();
        assert_eq!(decoder.decode(frame(0).as_bytes()).unwrap().seq, 0);
        assert_eq!(decoder.decode(frame(1).as_bytes()).unwrap().clock_ns, 42);
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
