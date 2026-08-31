//! Pure state machine for a future desktop broker relay. Deliberately unregistered: no Tauri
//! commands, events, protocols, eval calls, or capability grants live here. Payloads are byte-opaque:
//! typed Load/Call/Terminate and reply-kind validation belong to the broker protocol/adapter and
//! remain a release gate before this relay can be registered.

use std::collections::{HashMap, HashSet};

pub(crate) const MAIN_LABEL: &str = "main";
pub(crate) const BROKER_LABEL: &str = "capability-broker";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RelayErrorCode {
    WrongCaller,
    InvalidSession,
    InvalidRequest,
    Replay,
    OutOfOrder,
    Capacity,
    PayloadTooLarge,
    InvalidUtf8,
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
        if payload.len() > self.limits.max_payload_bytes {
            return Err(refuse(RelayErrorCode::PayloadTooLarge));
        }
        let payload =
            std::str::from_utf8(payload).map_err(|_| refuse(RelayErrorCode::InvalidUtf8))?;
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
        let javascript = format!(
            "globalThis.__brickwrightBrokerReceive({{\"session\":{},\"correlation\":{},\"payload\":{}}})",
            json_string(id.as_str()), json_string(correlation.as_str()), json_string(payload)
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
        let payload =
            std::str::from_utf8(payload).map_err(|_| refuse(RelayErrorCode::InvalidUtf8))?;
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
        let request_id = pending.request_id;
        state.pending.remove(&correlation);
        Ok(Reply {
            request_id,
            payload: payload.to_owned(),
        })
    }

    pub(crate) fn expire(&mut self, now: u64) -> Result<Vec<Cancellation>, RelayError> {
        self.observe_now(now)?;
        Ok(self.expire_at(now))
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
            max_sessions: 2,
            max_session_ids: 8,
            max_pending_per_session: 2,
            max_pending: 3,
            max_requests_per_session: 4,
            max_payload_bytes: 128,
            max_delivery_bytes: 512,
            session_ttl: 100,
            request_ttl: 10,
        }
    }
    fn random(byte: u8) -> impl FnOnce() -> Result<[u8; 32], ()> {
        move || Ok([byte; 32])
    }

    #[test]
    fn exact_labels_sequence_and_reply_correlation() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        assert_eq!(
            core.open_session("evil", 0, random(1)).unwrap_err().code,
            RelayErrorCode::WrongCaller
        );
        let session = core.open_session(MAIN_LABEL, 0, random(1)).unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 1, b"{}", 0, random(8))
                .unwrap_err()
                .code,
            RelayErrorCode::OutOfOrder
        );
        let delivery = core
            .request(MAIN_LABEL, session.as_str(), 0, b"{}", 0, random(8))
            .unwrap();
        assert_eq!(
            core.reply(
                MAIN_LABEL,
                session.as_str(),
                delivery.correlation.as_str(),
                b"ok",
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::WrongCaller
        );
        assert_eq!(
            core.reply(BROKER_LABEL, session.as_str(), &"9".repeat(64), b"ok", 1)
                .unwrap_err()
                .code,
            RelayErrorCode::UnknownRequest
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                delivery.correlation.as_str(),
                b"ok",
                1
            )
            .unwrap()
            .payload,
            "ok"
        );
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 0, b"{}", 1, random(9))
                .unwrap_err()
                .code,
            RelayErrorCode::Replay
        );
    }

    #[test]
    fn delivery_escapes_code_breakout_and_unicode_separators() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(2)).unwrap();
        let payload = "{\"x\":\"'</script>\\\\\u{2028}\u{2029}\"}";
        let delivery = core
            .request(
                MAIN_LABEL,
                session.as_str(),
                0,
                payload.as_bytes(),
                0,
                random(9),
            )
            .unwrap();
        assert!(!delivery.javascript.contains("</script>"));
        assert!(!delivery.javascript.contains('\u{2028}'));
        assert!(!delivery.javascript.contains('\u{2029}'));
        assert!(delivery.javascript.contains("\\u003c/script>"));
        assert!(delivery
            .javascript
            .starts_with("globalThis.__brickwrightBrokerReceive("));
    }

    #[test]
    fn capacity_bytes_random_and_clock_fail_closed() {
        let mut one = limits();
        one.max_sessions = 1;
        one.max_pending_per_session = 1;
        one.max_pending = 1;
        one.max_payload_bytes = 2;
        let mut core = BrokerTransportCore::new(one).unwrap();
        assert_eq!(
            core.open_session(MAIN_LABEL, 0, random(0))
                .unwrap_err()
                .code,
            RelayErrorCode::RandomFailure
        );
        let session = core.open_session(MAIN_LABEL, 0, random(3)).unwrap();
        assert_eq!(
            core.open_session(MAIN_LABEL, 0, random(4))
                .unwrap_err()
                .code,
            RelayErrorCode::Capacity
        );
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 0, b"xxx", 0, random(10))
                .unwrap_err()
                .code,
            RelayErrorCode::PayloadTooLarge
        );
        core.request(MAIN_LABEL, session.as_str(), 0, b"{}", 0, random(10))
            .unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 1, b"{}", 0, random(11))
                .unwrap_err()
                .code,
            RelayErrorCode::Capacity
        );
        assert_eq!(core.expire(0).unwrap().len(), 0);
        assert_eq!(core.expire(11).unwrap().len(), 1);
        assert_eq!(
            core.expire(10).unwrap_err().code,
            RelayErrorCode::ClockFailure
        );
    }

    #[test]
    fn teardown_cancels_all_pending_and_removes_authority() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        for byte in [5, 6] {
            let session = core.open_session(MAIN_LABEL, 0, random(byte)).unwrap();
            core.request(MAIN_LABEL, session.as_str(), 0, b"{}", 0, random(byte + 10))
                .unwrap();
        }
        assert_eq!(
            core.broker_teardown(MAIN_LABEL).unwrap_err().code,
            RelayErrorCode::WrongCaller
        );
        let cancelled = core.broker_teardown(BROKER_LABEL).unwrap();
        assert_eq!(cancelled.len(), 2);
        assert_eq!(core.counts(), (0, 0));
    }

    #[test]
    fn stable_errors_and_invalid_utf8_do_not_leak_input() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(7)).unwrap();
        let error = core
            .request(MAIN_LABEL, session.as_str(), 0, &[0xff], 0, random(17))
            .unwrap_err();
        assert_eq!(error.code, RelayErrorCode::InvalidUtf8);
        assert_eq!(error.to_string(), "broker transport refused");
        assert!(!format!("{error:?}").contains("secret"));
    }

    #[test]
    fn same_request_ids_route_only_by_session_and_host_correlation() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let a = core.open_session(MAIN_LABEL, 0, random(20)).unwrap();
        let b = core.open_session(MAIN_LABEL, 0, random(21)).unwrap();
        let da = core
            .request(MAIN_LABEL, a.as_str(), 0, b"a", 0, random(30))
            .unwrap();
        let db = core
            .request(MAIN_LABEL, b.as_str(), 0, b"b", 0, random(31))
            .unwrap();
        assert_eq!(
            core.reply(BROKER_LABEL, a.as_str(), db.correlation.as_str(), b"bad", 1)
                .unwrap_err()
                .code,
            RelayErrorCode::UnknownRequest
        );
        assert_eq!(
            core.reply(BROKER_LABEL, a.as_str(), da.correlation.as_str(), b"a", 1)
                .unwrap()
                .request_id,
            0
        );
        assert_eq!(
            core.reply(BROKER_LABEL, b.as_str(), db.correlation.as_str(), b"b", 1)
                .unwrap()
                .payload,
            "b"
        );
    }

    #[test]
    fn wrong_swapped_and_duplicate_correlations_never_deliver_another_reply() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(22)).unwrap();
        let first = core
            .request(MAIN_LABEL, session.as_str(), 0, b"a", 0, random(32))
            .unwrap();
        let second = core
            .request(MAIN_LABEL, session.as_str(), 1, b"b", 0, random(33))
            .unwrap();
        assert_eq!(
            core.reply(BROKER_LABEL, session.as_str(), &"f".repeat(64), b"x", 1)
                .unwrap_err()
                .code,
            RelayErrorCode::UnknownRequest
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                second.correlation.as_str(),
                b"b",
                1
            )
            .unwrap()
            .request_id,
            1
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                second.correlation.as_str(),
                b"again",
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::UnknownRequest
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                first.correlation.as_str(),
                b"a",
                1
            )
            .unwrap()
            .request_id,
            0
        );
    }

    #[test]
    fn reply_enforces_session_deadline_without_expire_tick() {
        let mut short = limits();
        short.session_ttl = 5;
        short.request_ttl = 20;
        let mut core = BrokerTransportCore::new(short).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(23)).unwrap();
        let first = core
            .request(MAIN_LABEL, session.as_str(), 0, b"a", 0, random(34))
            .unwrap();
        let second = core
            .request(MAIN_LABEL, session.as_str(), 1, b"b", 0, random(35))
            .unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 2, b"c", 5, random(36))
                .unwrap_err()
                .code,
            RelayErrorCode::Expired
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                first.correlation.as_str(),
                b"late",
                5
            )
            .unwrap_err()
            .code,
            RelayErrorCode::Expired
        );
        assert_eq!(core.counts(), (1, 2));
        let cancelled = core.expire(5).unwrap();
        assert_eq!(
            cancelled
                .iter()
                .map(|item| item.request_id)
                .collect::<Vec<_>>(),
            vec![0, 1]
        );
        assert_eq!(core.counts(), (0, 0));
        assert!(core.expire(5).unwrap().is_empty());
        assert_ne!(first.correlation, second.correlation);
    }

    #[test]
    fn completed_correlation_cannot_be_reused_or_satisfy_a_later_request() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(28)).unwrap();
        let first = core
            .request(MAIN_LABEL, session.as_str(), 0, b"a", 0, random(40))
            .unwrap();
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                first.correlation.as_str(),
                b"a",
                1
            )
            .unwrap()
            .request_id,
            0
        );
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 1, b"b", 1, random(40))
                .unwrap_err()
                .code,
            RelayErrorCode::RandomFailure
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                first.correlation.as_str(),
                b"late",
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::UnknownRequest
        );
        let second = core
            .request(MAIN_LABEL, session.as_str(), 1, b"b", 1, random(41))
            .unwrap();
        assert_ne!(first.correlation, second.correlation);
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                second.correlation.as_str(),
                b"b",
                2
            )
            .unwrap()
            .request_id,
            1
        );
    }

    #[test]
    fn correlation_zero_and_collision_fail_before_request_mutation() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let a = core.open_session(MAIN_LABEL, 0, random(24)).unwrap();
        let b = core.open_session(MAIN_LABEL, 0, random(25)).unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, a.as_str(), 0, b"a", 0, random(0))
                .unwrap_err()
                .code,
            RelayErrorCode::RandomFailure
        );
        core.request(MAIN_LABEL, a.as_str(), 0, b"a", 0, random(35))
            .unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, b.as_str(), 0, b"b", 0, random(35))
                .unwrap_err()
                .code,
            RelayErrorCode::RandomFailure
        );
        assert_eq!(
            core.request(MAIN_LABEL, b.as_str(), 0, b"b", 0, random(36))
                .unwrap()
                .request_id,
            0
        );
    }

    #[test]
    fn global_pending_cap_and_main_teardown_are_session_isolated_and_idempotent() {
        let mut capped = limits();
        capped.max_pending = 1;
        let mut core = BrokerTransportCore::new(capped).unwrap();
        let a = core.open_session(MAIN_LABEL, 0, random(26)).unwrap();
        let b = core.open_session(MAIN_LABEL, 0, random(27)).unwrap();
        core.request(MAIN_LABEL, a.as_str(), 0, b"a", 0, random(37))
            .unwrap();
        assert_eq!(
            core.request(MAIN_LABEL, b.as_str(), 0, b"b", 0, random(38))
                .unwrap_err()
                .code,
            RelayErrorCode::Capacity
        );
        assert_eq!(
            core.main_session_teardown("evil", a.as_str())
                .unwrap_err()
                .code,
            RelayErrorCode::WrongCaller
        );
        assert_eq!(
            core.main_session_teardown(MAIN_LABEL, a.as_str())
                .unwrap()
                .len(),
            1
        );
        assert!(core
            .main_session_teardown(MAIN_LABEL, a.as_str())
            .unwrap()
            .is_empty());
        assert_eq!(
            core.request(MAIN_LABEL, b.as_str(), 0, b"b", 0, random(38))
                .unwrap()
                .request_id,
            0
        );
        assert_eq!(core.counts(), (1, 1));
    }

    #[test]
    fn expired_request_reply_is_non_consuming_until_expire_emits_once() {
        let mut core = BrokerTransportCore::new(limits()).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(50)).unwrap();
        let delivery = core
            .request(MAIN_LABEL, session.as_str(), 0, b"x", 0, random(51))
            .unwrap();
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                session.as_str(),
                delivery.correlation.as_str(),
                b"late",
                10
            )
            .unwrap_err()
            .code,
            RelayErrorCode::Expired
        );
        assert_eq!(core.counts(), (1, 1));
        let cancelled = core.expire(10).unwrap();
        assert_eq!(cancelled.len(), 1);
        assert_eq!(cancelled[0].request_id, 0);
        assert_eq!(core.counts(), (1, 0));
        assert!(core.expire(10).unwrap().is_empty());
    }

    #[test]
    fn process_lifetime_session_history_prevents_teardown_reopen_aba() {
        let mut bounded = limits();
        bounded.max_session_ids = 2;
        let mut core = BrokerTransportCore::new(bounded).unwrap();
        let old = core.open_session(MAIN_LABEL, 0, random(52)).unwrap();
        let delivery = core
            .request(MAIN_LABEL, old.as_str(), 0, b"x", 0, random(53))
            .unwrap();
        assert_eq!(
            core.main_session_teardown(MAIN_LABEL, old.as_str())
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            core.open_session(MAIN_LABEL, 1, random(52))
                .unwrap_err()
                .code,
            RelayErrorCode::RandomFailure
        );
        core.open_session(MAIN_LABEL, 1, random(56)).unwrap();
        assert_eq!(
            core.open_session(MAIN_LABEL, 1, random(57))
                .unwrap_err()
                .code,
            RelayErrorCode::Capacity
        );
        assert_eq!(
            core.reply(
                BROKER_LABEL,
                old.as_str(),
                delivery.correlation.as_str(),
                b"late",
                1
            )
            .unwrap_err()
            .code,
            RelayErrorCode::InvalidSession
        );
    }

    #[test]
    fn serialized_delivery_bound_rejects_hostile_controls_before_mutation() {
        let mut bounded = limits();
        bounded.max_delivery_bytes = 230;
        let mut core = BrokerTransportCore::new(bounded).unwrap();
        let session = core.open_session(MAIN_LABEL, 0, random(54)).unwrap();
        let mut hostile: Vec<u8> = (0..=31).collect();
        hostile.extend_from_slice(b"\"\\</script>");
        assert_eq!(
            core.request(MAIN_LABEL, session.as_str(), 0, &hostile, 0, random(55))
                .unwrap_err()
                .code,
            RelayErrorCode::PayloadTooLarge
        );
        let accepted = core
            .request(MAIN_LABEL, session.as_str(), 0, b"{}", 0, random(55))
            .unwrap();
        assert_eq!(accepted.request_id, 0);
        assert!(!accepted.javascript.contains("</script>"));
    }
}
