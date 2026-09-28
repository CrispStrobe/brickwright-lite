//! Bounded decoder for the neutral `brick-state/v1` Renode stream.

use serde::Deserialize;

pub(crate) const MAX_BRICK_STATE_LINE_BYTES: usize = 256 * 1024;
const MAX_PORTS: usize = 6;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BrickIdentity {
    pub(crate) board: String,
    pub(crate) firmware: String,
    pub(crate) transport: String,
    pub(crate) image_sha256: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrickStateSnapshot {
    pub(crate) schema_version: u32,
    pub(crate) kind: String,
    pub(crate) seq: u64,
    pub(crate) clock_ns: u64,
    pub(crate) identity: BrickIdentity,
    #[serde(default)]
    pub(crate) ports: Vec<serde_json::Value>,
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
        if snapshot.schema_version != 1 || snapshot.kind != "snapshot" {
            return Err("brick-state version or kind is unsupported".into());
        }
        if snapshot.identity.board != "spike-prime" || snapshot.identity.transport != "none" {
            return Err("brick-state identity is not SPIKE Prime simulation".into());
        }
        if snapshot.ports.len() > MAX_PORTS {
            return Err("brick-state port set exceeds its bounds".into());
        }
        if let Some(digest) = &snapshot.identity.image_sha256 {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(seq: u64) -> String {
        format!(
            r#"{{"schemaVersion":1,"kind":"snapshot","seq":{seq},"clockNs":42,"identity":{{"board":"spike-prime","firmware":"brickwright-nuttx","transport":"none","imageSha256":null}},"ports":[]}}"#
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
            .decode(&vec![b'x'; MAX_BRICK_STATE_LINE_BYTES + 1])
            .is_err());
    }
}
