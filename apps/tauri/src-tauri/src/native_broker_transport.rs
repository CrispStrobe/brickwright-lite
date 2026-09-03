//! Pure state machine for a future desktop broker relay. Deliberately unregistered: no Tauri
//! commands, events, protocols, eval calls, or capability grants live here.

use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub(crate) const MAIN_LABEL: &str = "main";
pub(crate) const BROKER_LABEL: &str = "capability-broker";
const JS_MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_LOAD_EXTENSIONS: usize = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RelayErrorCode {
    WrongCaller,
    InvalidSession,
    InvalidRequest,
    Replay,
    OutOfOrder,
    Capacity,
    PayloadTooLarge,
    Expired,
    UnknownRequest,
    ClockFailure,
    RandomFailure,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RelayError {
    pub(crate) code: RelayErrorCode,
}

impl std::fmt::Display for RelayError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("broker transport refused")
    }
}

impl std::error::Error for RelayError {}

fn refuse(code: RelayErrorCode) -> RelayError {
    RelayError { code }
}

#[derive(Clone, Copy)]
pub(crate) struct RelayLimits {
    pub(crate) max_sessions: usize,
    pub(crate) max_session_ids: usize,
    pub(crate) max_pending_per_session: usize,
    pub(crate) max_pending: usize,
    pub(crate) max_requests_per_session: usize,
    pub(crate) max_payload_bytes: usize,
    pub(crate) max_delivery_bytes: usize,
    pub(crate) max_data_depth: usize,
    pub(crate) max_data_nodes: usize,
    pub(crate) max_string_bytes: usize,
    pub(crate) session_ttl: u64,
    pub(crate) request_ttl: u64,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct SessionId(String);

impl SessionId {
    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }

    fn parse(value: &str) -> Result<Self, RelayError> {
        if value.len() != 64
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(refuse(RelayErrorCode::InvalidSession));
        }
        Ok(Self(value.to_owned()))
    }
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct Delivery {
    pub(crate) session: SessionId,
    pub(crate) request_id: u64,
    pub(crate) correlation: CorrelationId,
    /// Fixed-code invocation with all data JSON-string encoded. The future host may pass this to
    /// the exact broker webview only after its own label and lifecycle checks.
    pub(crate) javascript: String,
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct Reply {
    pub(crate) request_id: u64,
    pub(crate) payload: String,
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct Cancellation {
    pub(crate) session: SessionId,
    pub(crate) request_id: u64,
    pub(crate) code: RelayErrorCode,
}

struct Pending {
    request_id: u64,
    deadline: u64,
    expected: ReplyKind,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum ReplyKind {
    Load,
    Call,
    Terminate,
    Capability,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum BrokerFailureCode {
    Closed,
    InvalidEnvelope,
    ReplayedRequest,
    OutOfOrderRequest,
    Capacity,
    InvalidData,
    InvalidUrl,
    UnpinnedUrl,
    StaleReply,
    OperationFailed,
    InvalidRegistration,
    UnknownWorker,
    UnknownExtension,
    UnknownMethod,
    Timeout,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
enum EditorRequest {
    Load {
        url: String,
    },
    Call {
        worker_id: u64,
        extension_id: u64,
        method: String,
        args: Value,
    },
    Terminate {
        worker_id: u64,
    },
    /// A semantic capability request. The editor names an OPERATION from the closed vocabulary
    /// and nothing else — no resource, and no lease. The broker realm chooses the resource and
    /// mints the lease, so the editor cannot widen what it asked for, and never holds authority
    /// it could reuse.
    Capability {
        operation: String,
        args: Value,
    },
}

impl EditorRequest {
    fn expected(&self) -> ReplyKind {
        match self {
            Self::Load { .. } => ReplyKind::Load,
            Self::Call { .. } => ReplyKind::Call,
            Self::Terminate { .. } => ReplyKind::Terminate,
            Self::Capability { .. } => ReplyKind::Capability,
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
enum BrokerReply {
    Load {
        worker_id: u64,
        extension_ids: Vec<u64>,
    },
    Call {
        result: Value,
    },
    Terminate {
        terminated: bool,
    },
    Capability {
        result: Value,
    },
    Failure {
        request_kind: ReplyKind,
        code: BrokerFailureCode,
    },
}

impl BrokerReply {
    fn kind(&self) -> ReplyKind {
        match self {
            Self::Load { .. } => ReplyKind::Load,
            Self::Call { .. } => ReplyKind::Call,
            Self::Terminate { .. } => ReplyKind::Terminate,
            Self::Capability { .. } => ReplyKind::Capability,
            Self::Failure { request_kind, .. } => *request_kind,
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct CorrelationId(String);

impl CorrelationId {
    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
    fn parse(value: &str) -> Result<Self, RelayError> {
        SessionId::parse(value).map(|id| Self(id.0))
    }
}

struct Session {
    // One session is one NativeBrokerProtocol instance; its sequence is never shared.
    next_request_id: u64,
    deadline: u64,
    pending: HashMap<CorrelationId, Pending>,
    used_correlations: HashSet<CorrelationId>,
}

pub(crate) struct BrokerTransportCore {
    limits: RelayLimits,
    sessions: HashMap<SessionId, Session>,
    used_session_ids: HashSet<SessionId>,
    last_now: Option<u64>,
}

impl BrokerTransportCore {
    pub(crate) fn new(limits: RelayLimits) -> Result<Self, RelayError> {
        if limits.max_sessions == 0
            || limits.max_pending_per_session == 0
            || limits.max_pending == 0
            || limits.max_requests_per_session == 0
            || limits.max_session_ids == 0
            || limits.max_payload_bytes == 0
            || limits.max_delivery_bytes == 0
            || limits.max_data_depth == 0
            || limits.max_data_nodes == 0
            || limits.max_string_bytes == 0
            || limits.session_ttl == 0
            || limits.request_ttl == 0
        {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        Ok(Self {
            limits,
            sessions: HashMap::new(),
            used_session_ids: HashSet::new(),
            last_now: None,
        })
    }

    fn observe_now(&mut self, now: u64) -> Result<(), RelayError> {
        if self.last_now.is_some_and(|previous| now < previous) {
            return Err(refuse(RelayErrorCode::ClockFailure));
        }
        self.last_now = Some(now);
        Ok(())
    }

    fn deadline(now: u64, ttl: u64) -> Result<u64, RelayError> {
        now.checked_add(ttl)
            .ok_or_else(|| refuse(RelayErrorCode::ClockFailure))
    }

    fn validate_value(&self, value: &Value) -> Result<(), RelayError> {
        fn walk(
            value: &Value,
            depth: usize,
            nodes: &mut usize,
            limits: RelayLimits,
        ) -> Result<(), RelayError> {
            *nodes = nodes
                .checked_add(1)
                .ok_or_else(|| refuse(RelayErrorCode::Capacity))?;
            if depth > limits.max_data_depth || *nodes > limits.max_data_nodes {
                return Err(refuse(RelayErrorCode::InvalidRequest));
            }
            match value {
                Value::Null | Value::Bool(_) | Value::Number(_) => Ok(()),
                Value::String(text) if text.len() <= limits.max_string_bytes => Ok(()),
                Value::String(_) => Err(refuse(RelayErrorCode::PayloadTooLarge)),
                Value::Array(items) => items
                    .iter()
                    .try_for_each(|item| walk(item, depth + 1, nodes, limits)),
                Value::Object(map) => map.iter().try_for_each(|(key, item)| {
                    if key.len() > limits.max_string_bytes {
                        return Err(refuse(RelayErrorCode::PayloadTooLarge));
                    }
                    walk(item, depth + 1, nodes, limits)
                }),
            }
        }
        walk(value, 0, &mut 0, self.limits)
    }

    fn parse_strict(&self, payload: &[u8]) -> Result<Value, RelayError> {
        struct StrictValue;
        impl<'de> Visitor<'de> for StrictValue {
            type Value = Value;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("JSON without duplicate object keys")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Value, E> {
                Ok(Value::Bool(v))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Value, E> {
                Ok(v.into())
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Value, E> {
                Ok(v.into())
            }
            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Value, E> {
                serde_json::Number::from_f64(v)
                    .map(Value::Number)
                    .ok_or_else(|| E::custom("non-finite number"))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Value, E> {
                Ok(Value::String(v.to_owned()))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<Value, E> {
                Ok(Value::String(v))
            }
            fn visit_none<E: de::Error>(self) -> Result<Value, E> {
                Ok(Value::Null)
            }
            fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
                Ok(Value::Null)
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Value, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = seq.next_element_seed(StrictSeed)? {
                    values.push(value);
                }
                Ok(Value::Array(values))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Value, A::Error> {
                let mut values = serde_json::Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    if values.contains_key(&key) {
                        return Err(de::Error::custom("duplicate key"));
                    }
                    values.insert(key, map.next_value_seed(StrictSeed)?);
                }
                Ok(Value::Object(values))
            }
        }
        struct StrictSeed;
        impl<'de> de::DeserializeSeed<'de> for StrictSeed {
            type Value = Value;
            fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Value, D::Error> {
                deserializer.deserialize_any(StrictValue)
            }
        }
        let mut deserializer = serde_json::Deserializer::from_slice(payload);
        let value = StrictSeed
            .deserialize(&mut deserializer)
            .map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        deserializer
            .end()
            .map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        Ok(value)
    }

    fn decode_request(&self, payload: &[u8]) -> Result<(EditorRequest, String), RelayError> {
        let parsed = self.parse_strict(payload)?;
        self.validate_value(&parsed)?;
        let request: EditorRequest =
            serde_json::from_value(parsed).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        if let EditorRequest::Load { url } = &request {
            if !url.starts_with("https://") {
                return Err(refuse(RelayErrorCode::InvalidRequest));
            }
        }
        match &request {
            EditorRequest::Call {
                worker_id,
                extension_id,
                ..
            } if *worker_id > JS_MAX_SAFE_INTEGER || *extension_id > JS_MAX_SAFE_INTEGER => {
                return Err(refuse(RelayErrorCode::InvalidRequest))
            }
            EditorRequest::Call { method, args, .. }
                if method.is_empty()
                    || method.len() > 128
                    || !method
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                    || !args.is_object() =>
            {
                return Err(refuse(RelayErrorCode::InvalidRequest))
            }
            EditorRequest::Terminate { worker_id } if *worker_id > JS_MAX_SAFE_INTEGER => {
                return Err(refuse(RelayErrorCode::InvalidRequest))
            }
            _ => {}
        }
        let value =
            serde_json::to_value(&request).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        self.validate_value(&value)?;
        let mut fields = value;
        fields
            .as_object_mut()
            .expect("typed request serializes as an object")
            .remove("kind");
        let canonical =
            serde_json::to_string(&fields).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        Ok((request, canonical))
    }

    fn decode_reply(&self, payload: &[u8]) -> Result<(BrokerReply, String), RelayError> {
        let parsed = self.parse_strict(payload)?;
        self.validate_value(&parsed)?;
        let reply: BrokerReply =
            serde_json::from_value(parsed).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        match &reply {
            BrokerReply::Load {
                worker_id,
                extension_ids,
            } => {
                let unique: HashSet<_> = extension_ids.iter().copied().collect();
                if *worker_id > JS_MAX_SAFE_INTEGER
                    || extension_ids.is_empty()
                    || extension_ids.len() > MAX_LOAD_EXTENSIONS
                    || unique.len() != extension_ids.len()
                    || extension_ids.iter().any(|id| *id > JS_MAX_SAFE_INTEGER)
                {
                    return Err(refuse(RelayErrorCode::InvalidRequest));
                }
            }
            BrokerReply::Terminate { terminated } if !terminated => {
                return Err(refuse(RelayErrorCode::InvalidRequest))
            }
            _ => {}
        }
        let value =
            serde_json::to_value(&reply).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        self.validate_value(&value)?;
        let canonical =
            serde_json::to_string(&reply).map_err(|_| refuse(RelayErrorCode::InvalidRequest))?;
        Ok((reply, canonical))
    }

    pub(crate) fn open_session(
        &mut self,
        caller_label: &str,
        now: u64,
        random: impl FnOnce() -> Result<[u8; 32], ()>,
    ) -> Result<SessionId, RelayError> {
        if caller_label != MAIN_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        self.observe_now(now)?;
        if self.sessions.len() >= self.limits.max_sessions {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        if self.used_session_ids.len() >= self.limits.max_session_ids {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        let bytes = random().map_err(|_| refuse(RelayErrorCode::RandomFailure))?;
        if bytes.iter().all(|byte| *byte == 0) {
            return Err(refuse(RelayErrorCode::RandomFailure));
        }
        let id = SessionId(hex(&bytes));
        if self.used_session_ids.contains(&id) {
            return Err(refuse(RelayErrorCode::RandomFailure));
        }
        self.sessions.insert(
            id.clone(),
            Session {
                next_request_id: 0,
                deadline: Self::deadline(now, self.limits.session_ttl)?,
                pending: HashMap::new(),
                used_correlations: HashSet::new(),
            },
        );
        self.used_session_ids.insert(id.clone());
        Ok(id)
    }

    pub(crate) fn request(
        &mut self,
        caller_label: &str,
        session: &str,
        request_id: u64,
        payload: &[u8],
        now: u64,
        random_correlation: impl FnOnce() -> Result<[u8; 32], ()>,
    ) -> Result<Delivery, RelayError> {
        if caller_label != MAIN_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        self.observe_now(now)?;
        if request_id > JS_MAX_SAFE_INTEGER {
            return Err(refuse(RelayErrorCode::InvalidRequest));
        }
        if payload.len() > self.limits.max_payload_bytes {
            return Err(refuse(RelayErrorCode::PayloadTooLarge));
        }
        let (typed_request, payload) = self.decode_request(payload)?;
        let id = SessionId::parse(session)?;
        let state = self
            .sessions
            .get(&id)
            .ok_or_else(|| refuse(RelayErrorCode::InvalidSession))?;
        if now >= state.deadline {
            return Err(refuse(RelayErrorCode::Expired));
        }
        if request_id < state.next_request_id {
            return Err(refuse(RelayErrorCode::Replay));
        }
        if request_id != state.next_request_id {
            return Err(refuse(RelayErrorCode::OutOfOrder));
        }
        if state.pending.len() >= self.limits.max_pending_per_session {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        if state.used_correlations.len() >= self.limits.max_requests_per_session {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        let global_pending = self
            .sessions
            .values()
            .try_fold(0usize, |total, session| {
                total.checked_add(session.pending.len())
            })
            .ok_or_else(|| refuse(RelayErrorCode::Capacity))?;
        if global_pending >= self.limits.max_pending {
            return Err(refuse(RelayErrorCode::Capacity));
        }
        let correlation_bytes =
            random_correlation().map_err(|_| refuse(RelayErrorCode::RandomFailure))?;
        if correlation_bytes.iter().all(|byte| *byte == 0) {
            return Err(refuse(RelayErrorCode::RandomFailure));
        }
        let correlation = CorrelationId(hex(&correlation_bytes));
        if self
            .sessions
            .values()
            .any(|session| session.used_correlations.contains(&correlation))
        {
            return Err(refuse(RelayErrorCode::RandomFailure));
        }
        let deadline = Self::deadline(now, self.limits.request_ttl)?.min(state.deadline);
        let kind = match typed_request.expected() {
            ReplyKind::Load => "load",
            ReplyKind::Call => "call",
            ReplyKind::Terminate => "terminate",
            ReplyKind::Capability => "capability",
        };
        // The broker bootstrap adds protocol:1 and maps these fixed outer fields to the exact
        // camelCase NativeBrokerProtocol envelope. `payload` contains request fields only.
        let javascript = format!(
            "globalThis.__brickwrightBrokerReceive({{\"session\":{},\"correlation\":{},\"kind\":{},\"requestId\":{},\"payload\":{}}})",
            json_string(id.as_str()), json_string(correlation.as_str()), json_string(kind), request_id, json_string(&payload)
        );
        if javascript.len() > self.limits.max_delivery_bytes {
            return Err(refuse(RelayErrorCode::PayloadTooLarge));
        }
        let state = self
            .sessions
            .get_mut(&id)
            .expect("validated session remains present");
        state.next_request_id = state
            .next_request_id
            .checked_add(1)
            .ok_or_else(|| refuse(RelayErrorCode::InvalidRequest))?;
        state.pending.insert(
            correlation.clone(),
            Pending {
                request_id,
                deadline,
                expected: typed_request.expected(),
            },
        );
        state.used_correlations.insert(correlation.clone());
        Ok(Delivery {
            session: id,
            request_id,
            correlation,
            javascript,
        })
    }

    pub(crate) fn reply(
        &mut self,
        caller_label: &str,
        session: &str,
        correlation: &str,
        request_id: u64,
        payload: &[u8],
        now: u64,
    ) -> Result<Reply, RelayError> {
        if caller_label != BROKER_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        self.observe_now(now)?;
        if payload.len() > self.limits.max_payload_bytes {
            return Err(refuse(RelayErrorCode::PayloadTooLarge));
        }
        let (typed_reply, payload) = self.decode_reply(payload)?;
        let id = SessionId::parse(session)?;
        let correlation = CorrelationId::parse(correlation)?;
        let state = self
            .sessions
            .get_mut(&id)
            .ok_or_else(|| refuse(RelayErrorCode::InvalidSession))?;
        if now >= state.deadline {
            return Err(refuse(RelayErrorCode::Expired));
        }
        let pending = state
            .pending
            .get(&correlation)
            .ok_or_else(|| refuse(RelayErrorCode::UnknownRequest))?;
        if now >= pending.deadline {
            return Err(refuse(RelayErrorCode::Expired));
        }
        if request_id != pending.request_id || request_id > JS_MAX_SAFE_INTEGER {
            return Err(refuse(RelayErrorCode::InvalidRequest));
        }
        // Wrong/reflected kinds leave pending intact for one correct, bounded retry.
        if typed_reply.kind() != pending.expected {
            return Err(refuse(RelayErrorCode::InvalidRequest));
        }
        let request_id = pending.request_id;
        state.pending.remove(&correlation);
        Ok(Reply {
            request_id,
            payload,
        })
    }

    pub(crate) fn expire(&mut self, now: u64) -> Result<Vec<Cancellation>, RelayError> {
        self.observe_now(now)?;
        Ok(self.expire_at(now))
    }

    /// Cancel exactly one delivered request without closing its session or releasing its
    /// sequence/correlation tombstones. Used by the caller-side timeout transition.
    pub(crate) fn cancel_delivery(
        &mut self,
        caller_label: &str,
        session: &str,
        correlation: &str,
        request_id: u64,
    ) -> Result<Cancellation, RelayError> {
        if caller_label != MAIN_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        let id = SessionId::parse(session)?;
        let correlation = CorrelationId::parse(correlation)?;
        let state = self
            .sessions
            .get_mut(&id)
            .ok_or_else(|| refuse(RelayErrorCode::InvalidSession))?;
        let pending = state
            .pending
            .get(&correlation)
            .ok_or_else(|| refuse(RelayErrorCode::UnknownRequest))?;
        if pending.request_id != request_id {
            return Err(refuse(RelayErrorCode::InvalidRequest));
        }
        state.pending.remove(&correlation);
        Ok(Cancellation {
            session: id,
            request_id,
            code: RelayErrorCode::Expired,
        })
    }

    fn expire_at(&mut self, now: u64) -> Vec<Cancellation> {
        let mut cancelled = Vec::new();
        self.sessions.retain(|id, session| {
            if now >= session.deadline {
                cancelled.extend(session.pending.values().map(|pending| Cancellation {
                    session: id.clone(),
                    request_id: pending.request_id,
                    code: RelayErrorCode::Expired,
                }));
                return false;
            }
            session.pending.retain(|_correlation, pending| {
                if now >= pending.deadline {
                    cancelled.push(Cancellation {
                        session: id.clone(),
                        request_id: pending.request_id,
                        code: RelayErrorCode::Expired,
                    });
                    false
                } else {
                    true
                }
            });
            true
        });
        cancelled.sort_by_key(|item| (item.session.0.clone(), item.request_id));
        cancelled
    }

    pub(crate) fn broker_teardown(
        &mut self,
        caller_label: &str,
    ) -> Result<Vec<Cancellation>, RelayError> {
        if caller_label != BROKER_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        let mut cancelled = Vec::new();
        for (session, state) in self.sessions.drain() {
            cancelled.extend(state.pending.into_values().map(|pending| Cancellation {
                session: session.clone(),
                request_id: pending.request_id,
                code: RelayErrorCode::InvalidSession,
            }));
        }
        cancelled.sort_by_key(|item| (item.session.0.clone(), item.request_id));
        Ok(cancelled)
    }

    /// Main teardown is idempotent: a well-formed session which is already absent returns no
    /// cancellations. It never affects any other session.
    pub(crate) fn main_session_teardown(
        &mut self,
        caller_label: &str,
        session: &str,
    ) -> Result<Vec<Cancellation>, RelayError> {
        if caller_label != MAIN_LABEL {
            return Err(refuse(RelayErrorCode::WrongCaller));
        }
        let id = SessionId::parse(session)?;
        let Some(state) = self.sessions.remove(&id) else {
            return Ok(Vec::new());
        };
        let mut cancelled: Vec<_> = state
            .pending
            .into_values()
            .map(|pending| Cancellation {
                session: id.clone(),
                request_id: pending.request_id,
                code: RelayErrorCode::InvalidSession,
            })
            .collect();
        cancelled.sort_by_key(|item| item.request_id);
        Ok(cancelled)
    }

    #[cfg(test)]
    fn counts(&self) -> (usize, usize) {
        (
            self.sessions.len(),
            self.sessions
                .values()
                .map(|session| session.pending.len())
                .sum(),
        )
    }
}

fn hex(bytes: &[u8; 32]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in bytes {
        output.push(DIGITS[(byte >> 4) as usize] as char);
        output.push(DIGITS[(byte & 15) as usize] as char);
    }
    output
}

fn json_string(value: &str) -> String {
    let mut output = String::from("\"");
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\u{0c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            '<' => output.push_str("\\u003c"),
            '\u{2028}' => output.push_str("\\u2028"),
            '\u{2029}' => output.push_str("\\u2029"),
            c if c <= '\u{1f}' => output.push_str(&format!("\\u{:04x}", c as u32)),
            c => output.push(c),
        }
    }
    output.push('"');
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    fn limits() -> RelayLimits {
        RelayLimits {
            max_sessions: 3,
            max_session_ids: 8,
            max_pending_per_session: 3,
            max_pending: 5,
            max_requests_per_session: 4,
            max_payload_bytes: 512,
            max_delivery_bytes: 1024,
            max_data_depth: 6,
            max_data_nodes: 32,
            max_string_bytes: 128,
            session_ttl: 100,
            request_ttl: 10,
        }
    }
    fn rng(byte: u8) -> impl FnOnce() -> Result<[u8; 32], ()> {
        move || Ok([byte; 32])
    }
    const LOAD: &[u8] = br#"{"kind":"load","url":"https://gallery.invalid/x.js"}"#;
    const CALL: &[u8] =
        br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"probe","args":{"x":1}}"#;
    const TERMINATE: &[u8] = br#"{"kind":"terminate","worker_id":0}"#;
    const CAPABILITY: &[u8] = br#"{"kind":"capability","operation":"platform.kind.read","args":{}}"#;
    const CAPABILITY_REPLY: &[u8] = br#"{"kind":"capability","result":"linux"}"#;
    const LOAD_REPLY: &[u8] = br#"{"kind":"load","worker_id":0,"extension_ids":[0]}"#;
    const CALL_REPLY: &[u8] = br#"{"kind":"call","result":{"ok":true}}"#;
    const TERMINATE_REPLY: &[u8] = br#"{"kind":"terminate","terminated":true}"#;
    fn session(core: &mut BrokerTransportCore, byte: u8) -> SessionId {
        core.open_session(MAIN_LABEL, 0, rng(byte)).unwrap()
    }

    #[test]
    fn typed_load_round_trip() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 1);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(11))
            .unwrap();
        let r = c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1,
            )
            .unwrap();
        assert_eq!(r.request_id, 0);
        assert!(r.payload.contains("\"kind\":\"load\""));
    }
    #[test]
    fn typed_call_round_trip() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 2);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, CALL, 0, rng(12))
            .unwrap();
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                CALL_REPLY,
                1
            )
            .unwrap()
            .request_id,
            0
        );
    }
    #[test]
    fn typed_terminate_round_trip() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 3);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, TERMINATE, 0, rng(13))
            .unwrap();
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                TERMINATE_REPLY,
                1
            )
            .is_ok());
    }
    #[test]
    fn request_as_reply_is_rejected_without_consuming_pending() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 4);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(14))
            .unwrap();
        assert_eq!(
            c.reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, LOAD, 1)
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .is_ok());
    }
    #[test]
    fn reply_as_request_is_rejected_before_sequence_mutation() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 5);
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, LOAD_REPLY, 0, rng(15))
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(15))
                .unwrap()
                .request_id,
            0
        );
    }
    #[test]
    fn kind_swap_remains_pending_for_correct_reply() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 6);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, CALL, 0, rng(16))
            .unwrap();
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                TERMINATE_REPLY,
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                CALL_REPLY,
                1
            )
            .is_ok());
    }
    #[test]
    fn extra_request_fields_are_rejected() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 7);
        let bad = br#"{"kind":"load","url":"https://gallery.invalid/x.js","source":"x"}"#;
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, bad, 0, rng(17))
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
    }
    #[test]
    fn extra_reply_fields_do_not_consume_pending() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 8);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(18))
            .unwrap();
        let bad = br#"{"kind":"load","worker_id":0,"extension_ids":[0],"result":"reflection"}"#;
        assert!(c
            .reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, bad, 1)
            .is_err());
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .is_ok());
    }
    #[test]
    fn oversized_nesting_and_nodes_fail_closed() {
        let mut l = limits();
        l.max_data_depth = 2;
        let mut c = BrokerTransportCore::new(l).unwrap();
        let s = session(&mut c, 9);
        let deep=br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"x","args":{"a":{"b":{"c":1}}}}"#;
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, deep, 0, rng(19))
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
    }
    #[test]
    fn hostile_strings_are_canonicalized_and_script_escaped() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 10);
        let hostile="{\"kind\":\"call\",\"worker_id\":0,\"extension_id\":0,\"method\":\"x\",\"args\":{\"x\":\"'</script>\\u2028\\u2029\"}}";
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, hostile.as_bytes(), 0, rng(20))
            .unwrap();
        assert!(!d.javascript.contains("</script>"));
        assert!(!d.javascript.contains('\u{2028}'));
    }
    /// The editor supplies `payload`, and the relay embeds it in JavaScript that is `eval`d
    /// inside the BROKER realm. If a payload could close the string literal it sits in, the
    /// editor would be executing code in the realm that holds the capability grants, and every
    /// other control in this file would be decoration.
    ///
    /// `hostile_strings_are_canonicalized_and_script_escaped` covers `</script>` and the line
    /// separators. It does not cover the direct break-out — close the quote, close the call,
    /// append a statement — which is what an attacker reaches for first.
    ///
    /// This is asserted STRUCTURALLY, by round-tripping, and the first version of it was wrong
    /// in a way worth recording: it looked for the absence of a bare `"});globalThis`. That
    /// substring is present even when the escaping is perfect, because the escaped form `\"`
    /// still contains a quote followed by `})`. Substring matching cannot tell an escaped quote
    /// from a live one. Parsing can.
    #[test]
    fn a_payload_cannot_close_the_javascript_string_it_is_embedded_in() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 60);
        // args.x is `"});globalThis.__pwned=1;({"y":"` — a closed quote, a closed call, a
        // statement, and a fresh open expression to swallow the trailing syntax.
        const ATTACK: &str = "\"});globalThis.__pwned=1;({\"y\":\"";
        let breakout = br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"x","args":{"x":"\"});globalThis.__pwned=1;({\"y\":\""}}"#;
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, breakout, 0, rng(61))
            .unwrap();

        // One call, and the whole delivery is that call — not the call plus an appended statement.
        assert_eq!(
            d.javascript.matches("__brickwrightBrokerReceive(").count(),
            1,
            "the delivery grew a second statement: {}",
            d.javascript
        );
        let inner = d
            .javascript
            .strip_prefix("globalThis.__brickwrightBrokerReceive(")
            .and_then(|rest| rest.strip_suffix(')'))
            .expect("the delivery must be exactly one receiver call");

        // If the payload had escaped its literal, what is left here would not parse.
        let envelope: serde_json::Value =
            serde_json::from_str(inner).expect("the delivery argument must still be valid JSON");
        let carried = envelope["payload"]
            .as_str()
            .expect("payload must be carried as a string");
        let request: serde_json::Value =
            serde_json::from_str(carried).expect("the carried payload must still be valid JSON");

        // And it round-trips: the attacker's text arrives as DATA, byte for byte.
        assert_eq!(
            request["args"]["x"].as_str(),
            Some(ATTACK),
            "the payload did not survive as data: {}",
            d.javascript
        );
    }

    /// The `capability` kind inherits the reply/request binding at line ~631, which compares
    /// `typed_reply.kind()` against `pending.expected` for every variant. Structurally it cannot
    /// have been missed. It is pinned anyway, because a generic mechanism is exactly the thing a
    /// later change special-cases, and because THIS kind's `result` flows back to the editor: if
    /// a `call` reply could satisfy a capability request, the editor would receive a worker's
    /// output where a semantic result belongs.
    #[test]
    fn a_capability_request_is_not_satisfied_by_another_kind_of_reply() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 70);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, CAPABILITY, 0, rng(71))
            .unwrap();
        assert!(d.javascript.contains(r#""kind":"capability""#));

        // A worker-shaped reply must not answer it, and must not consume the pending request.
        assert_eq!(
            c.reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, CALL_REPLY, 1)
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        // Still pending, so the correct reply is still accepted afterwards.
        assert!(c
            .reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, CAPABILITY_REPLY, 1)
            .is_ok());
    }

    #[test]
    fn a_capability_reply_cannot_answer_a_worker_request() {
        // The other direction: a capability RESULT must not be handed back where a worker call
        // was expected, or a semantic read could stand in for an extension's output.
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 72);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, CALL, 0, rng(73))
            .unwrap();
        assert_eq!(
            c.reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, CAPABILITY_REPLY, 1)
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .reply(BROKER_LABEL, s.as_str(), d.correlation.as_str(), 0, CALL_REPLY, 1)
            .is_ok());
    }

    #[test]
    fn cross_session_correlation_cannot_route() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let a = session(&mut c, 21);
        let b = session(&mut c, 22);
        let d = c
            .request(MAIN_LABEL, a.as_str(), 0, LOAD, 0, rng(23))
            .unwrap();
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                b.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::UnknownRequest
        );
    }
    #[test]
    fn duplicate_and_late_reply_are_stable_failures() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 24);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(25))
            .unwrap();
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .is_ok());
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::UnknownRequest
        );
    }
    #[test]
    fn expiry_preserves_cancellation_until_expire_tick() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 26);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(27))
            .unwrap();
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                10
            )
            .unwrap_err()
            .code,
            RelayErrorCode::Expired
        );
        assert_eq!(c.expire(10).unwrap().len(), 1);
        assert!(c.expire(10).unwrap().is_empty());
    }
    #[test]
    fn teardown_is_label_bound_and_session_isolated() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let a = session(&mut c, 28);
        let b = session(&mut c, 29);
        c.request(MAIN_LABEL, a.as_str(), 0, LOAD, 0, rng(30))
            .unwrap();
        c.request(MAIN_LABEL, b.as_str(), 0, LOAD, 0, rng(31))
            .unwrap();
        assert_eq!(
            c.main_session_teardown(MAIN_LABEL, a.as_str())
                .unwrap()
                .len(),
            1
        );
        assert_eq!(c.counts(), (1, 1));
        assert_eq!(c.broker_teardown(BROKER_LABEL).unwrap().len(), 1);
    }

    #[test]
    fn duplicate_keys_are_rejected_without_sequence_mutation() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 32);
        let duplicate =
            br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"x","args":{"x":1,"x":2}}"#;
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, duplicate, 0, rng(33))
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(33))
            .is_ok());
    }

    #[test]
    fn javascript_unsafe_ids_and_invalid_load_sets_are_rejected() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 34);
        let unsafe_call = br#"{"kind":"call","worker_id":9007199254740992,"extension_id":0,"method":"x","args":null}"#;
        assert_eq!(
            c.request(MAIN_LABEL, s.as_str(), 0, unsafe_call, 0, rng(35))
                .unwrap_err()
                .code,
            RelayErrorCode::InvalidRequest
        );
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(35))
            .unwrap();
        let duplicate_extensions = br#"{"kind":"load","worker_id":0,"extension_ids":[1,1]}"#;
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                duplicate_extensions,
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .is_ok());
    }

    #[test]
    fn terminate_false_and_unlisted_failure_codes_leave_pending() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 36);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, TERMINATE, 0, rng(37))
            .unwrap();
        let false_reply = br#"{"kind":"terminate","terminated":false}"#;
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                false_reply,
                1
            )
            .is_err());
        let invented = br#"{"kind":"failure","request_kind":"terminate","code":"invoke-anything"}"#;
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                invented,
                1
            )
            .is_err());
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                TERMINATE_REPLY,
                1
            )
            .is_ok());
    }

    #[test]
    fn allowlisted_failure_is_bound_to_expected_kind() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 38);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, CALL, 0, rng(39))
            .unwrap();
        let reflected = br#"{"kind":"failure","request_kind":"load","code":"operation-failed"}"#;
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                reflected,
                1
            )
            .is_err());
        let failure = br#"{"kind":"failure","request_kind":"call","code":"operation-failed"}"#;
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                failure,
                1
            )
            .is_ok());
    }

    #[test]
    fn outer_request_id_above_javascript_safe_integer_does_not_advance_sequence() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 40);
        assert_eq!(
            c.request(
                MAIN_LABEL,
                s.as_str(),
                JS_MAX_SAFE_INTEGER + 1,
                LOAD,
                0,
                rng(41)
            )
            .unwrap_err()
            .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(41))
            .is_ok());
    }

    #[test]
    fn call_requires_plain_object_args_and_restricted_method_name() {
        let invalid = [
            br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"native.invoke","args":{}}"#
                .as_slice(),
            br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"","args":{}}"#.as_slice(),
            br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"ok","args":null}"#
                .as_slice(),
            br#"{"kind":"call","worker_id":0,"extension_id":0,"method":"ok","args":[]}"#.as_slice(),
        ];
        for (index, payload) in invalid.into_iter().enumerate() {
            let mut c = BrokerTransportCore::new(limits()).unwrap();
            let s = session(&mut c, 42 + index as u8);
            assert_eq!(
                c.request(MAIN_LABEL, s.as_str(), 0, payload, 0, rng(50 + index as u8))
                    .unwrap_err()
                    .code,
                RelayErrorCode::InvalidRequest
            );
        }
    }

    #[test]
    fn delivery_contains_fixed_routing_envelope_and_fields_only_payload() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 60);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(61))
            .unwrap();
        assert!(d.javascript.contains(r#""kind":"load""#));
        assert!(d.javascript.contains(r#""requestId":0"#));
        assert!(d
            .javascript
            .contains(r#""payload":"{\"url\":\"https://gallery.invalid/x.js\"}""#));
        assert!(!d.javascript.contains(r#"\\\"kind\\\":\\\"load\\\""#));
    }

    #[test]
    fn wrong_inner_reply_id_leaves_pending_for_correct_reply() {
        let mut c = BrokerTransportCore::new(limits()).unwrap();
        let s = session(&mut c, 62);
        let d = c
            .request(MAIN_LABEL, s.as_str(), 0, LOAD, 0, rng(63))
            .unwrap();
        assert_eq!(
            c.reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                1,
                LOAD_REPLY,
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::InvalidRequest
        );
        assert!(c
            .reply(
                BROKER_LABEL,
                s.as_str(),
                d.correlation.as_str(),
                0,
                LOAD_REPLY,
                1
            )
            .is_ok());
    }
}
