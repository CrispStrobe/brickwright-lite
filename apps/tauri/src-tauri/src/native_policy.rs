//! Pure policy state machine for a future isolated native capability broker.
//!
//! This module intentionally has no Tauri commands and performs no platform
//! work. The eventual host must generate `LeaseId` with an OS CSPRNG and keep
//! it inside the separately isolated `capability-broker` webview.

use serde_json::Value;
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const BROKER_LABEL: &str = "capability-broker";

#[derive(Clone)]
pub(crate) struct NativePolicyState {
    inner: Arc<NativePolicyStateInner>,
}

struct NativePolicyStateInner {
    core: Mutex<PolicyCore>,
    epoch: Instant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StateError {
    Denied(Denial),
    Unavailable,
}

impl NativePolicyState {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(NativePolicyStateInner {
                core: Mutex::new(PolicyCore::new(Limits {
                    lease_ttl: 60_000,
                    request_budget: 256,
                    max_live_leases: 256,
                    audit_capacity: 1_024,
                })),
                epoch: Instant::now(),
            }),
        }
    }

    fn now(&self) -> u64 {
        let elapsed = self.inner.epoch.elapsed().as_millis();
        u64::try_from(elapsed).unwrap_or(u64::MAX)
    }

    /// The declaration set is HOST-derived and fixed. A caller cannot widen it, cannot name a
    /// second operation, and cannot ask for a lease over anything the packaged pin did not
    /// declare — because nothing a caller sends reaches this function at all.
    pub(crate) fn issue_broker_lease(
        &self,
        caller_label: &str,
        audit_id: u64,
        id: LeaseId,
    ) -> Result<LeaseId, StateError> {
        let identity = HostIdentity::new(
            audit_id,
            [(Operation::PlatformKindRead, Resource::PlatformDefault)],
        );
        let now = self.now();
        self.inner
            .core
            .lock()
            .map_err(|_| StateError::Unavailable)?
            .issue(caller_label, identity, id, now)
            .map_err(StateError::Denied)
    }

    /// Operation and resource arrive as NAMES and are parsed inside the core, so an unknown
    /// name is a denial rather than a panic; `args` must be an empty object or the core refuses
    /// it as malformed before any lease state is touched.
    pub(crate) fn authorize_broker_call(
        &self,
        caller_label: &str,
        id: LeaseId,
        sequence: u64,
        operation: &str,
        resource: &str,
        args: &Value,
    ) -> Result<AuthorizedCall, StateError> {
        let now = self.now();
        self.inner
            .core
            .lock()
            .map_err(|_| StateError::Unavailable)?
            .authorize(caller_label, id, sequence, operation, resource, args, now)
            .map_err(StateError::Denied)
    }

    /// A bounded, already-redacted view of the audit ring, for the diagnostics surface.
    ///
    /// Redaction here is structural rather than a filtering step that could be forgotten:
    /// `AuditEvent` has no field for a pin source, a digest, a lease id, a correlation id, raw
    /// arguments or a result, so there is nothing to strip. What remains is a host-derived
    /// principal, the operation and resource NAMES, a sequence number and a decision — enough
    /// to render "declared, allowed, refused, revoked" and nothing more. `LeaseId`'s own Debug
    /// prints `[REDACTED]`, so even a future accidental include cannot leak one through a log.
    pub(crate) fn redacted_audit(&self) -> Result<Vec<RedactedAuditRow>, StateError> {
        Ok(self
            .inner
            .core
            .lock()
            .map_err(|_| StateError::Unavailable)?
            .audit()
            .map(RedactedAuditRow::from_event)
            .collect())
    }

    pub(crate) fn revoke_all(&self, caller_label: &str) -> Result<usize, StateError> {
        let now = self.now();
        self.inner
            .core
            .lock()
            .map_err(|_| StateError::Unavailable)?
            .revoke_all(caller_label, now)
            .map_err(StateError::Denied)
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) enum Operation {
    PlatformKindRead,
}

impl Operation {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "platform.kind.read" => Some(Self::PlatformKindRead),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub(crate) enum Resource {
    PlatformDefault,
}

impl Resource {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "platform/default" => Some(Self::PlatformDefault),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Eq, Hash, PartialEq)]
pub(crate) struct LeaseId([u8; 32]);

impl LeaseId {
    /// `bytes` must be generated by the native host's OS CSPRNG.
    pub(crate) fn from_host_random(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Lowercase hex, so the id can be held by the ISOLATED broker webview and handed back on
    /// the next call. It never reaches the editor realm; see the module header.
    pub(crate) fn to_hex(self) -> String {
        let mut out = String::with_capacity(64);
        for byte in self.0 {
            out.push(char::from_digit(u32::from(byte >> 4), 16).expect("nibble is hex"));
            out.push(char::from_digit(u32::from(byte & 0x0f), 16).expect("nibble is hex"));
        }
        out
    }

    /// Exactly 64 lowercase hex characters. Anything else is not a lease id and must not be
    /// coerced into one — a short or mixed-case value is a caller error, not a near miss.
    pub(crate) fn parse_hex(value: &str) -> Option<Self> {
        if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) {
            return None;
        }
        let mut bytes = [0u8; 32];
        for (index, chunk) in value.as_bytes().chunks_exact(2).enumerate() {
            let hi = char::from(chunk[0]).to_digit(16)?;
            let lo = char::from(chunk[1]).to_digit(16)?;
            bytes[index] = u8::try_from(hi * 16 + lo).ok()?;
        }
        Some(Self(bytes))
    }
}

impl std::fmt::Debug for LeaseId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("LeaseId([REDACTED])")
    }
}

#[derive(Clone)]
pub(crate) struct HostIdentity {
    /// Non-secret, host-derived identifier suitable for diagnostics.
    audit_id: u64,
    declarations: BTreeSet<(Operation, Resource)>,
}

impl HostIdentity {
    pub(crate) fn new(
        audit_id: u64,
        declarations: impl IntoIterator<Item = (Operation, Resource)>,
    ) -> Self {
        Self {
            audit_id,
            declarations: declarations.into_iter().collect(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Denial {
    WrongCaller,
    UnknownOperation,
    UnknownResource,
    MalformedArguments,
    UnknownLease,
    Revoked,
    Expired,
    Exhausted,
    OutOfSequence,
    Undeclared,
    Capacity,
    InvalidLease,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Decision {
    Allowed,
    Denied(Denial),
    Revoked,
    Issued,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AuditEvent {
    pub(crate) index: u64,
    pub(crate) at: u64,
    pub(crate) principal: Option<u64>,
    pub(crate) operation: Option<Operation>,
    pub(crate) resource: Option<Resource>,
    pub(crate) sequence: Option<u64>,
    pub(crate) decision: Decision,
}

/// The diagnostics row. Every field is a name, a counter or a verdict; none is a secret, and
/// the type carries no variant that could become one without a deliberate edit here.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub(crate) struct RedactedAuditRow {
    pub(crate) index: u64,
    pub(crate) at: u64,
    pub(crate) principal: Option<u64>,
    pub(crate) operation: Option<&'static str>,
    pub(crate) resource: Option<&'static str>,
    pub(crate) sequence: Option<u64>,
    pub(crate) decision: &'static str,
    pub(crate) denial: Option<&'static str>,
}

impl RedactedAuditRow {
    fn from_event(event: &AuditEvent) -> Self {
        let (decision, denial) = match event.decision {
            Decision::Allowed => ("allowed", None),
            Decision::Issued => ("issued", None),
            Decision::Revoked => ("revoked", None),
            Decision::Denied(reason) => ("denied", Some(Self::denial_name(reason))),
        };
        Self {
            index: event.index,
            at: event.at,
            principal: event.principal,
            operation: event.operation.map(|_| "platform.kind.read"),
            resource: event.resource.map(|_| "platform/default"),
            sequence: event.sequence,
            decision,
            denial,
        }
    }

    /// Stable, caller-facing denial names. They are deliberately the same vocabulary the policy
    /// core refuses with, so a diagnostics reader and a refusal cannot disagree about why.
    fn denial_name(reason: Denial) -> &'static str {
        match reason {
            Denial::WrongCaller => "wrong-caller",
            Denial::UnknownOperation => "unknown-operation",
            Denial::UnknownResource => "unknown-resource",
            Denial::MalformedArguments => "malformed-arguments",
            Denial::UnknownLease => "unknown-lease",
            Denial::Revoked => "revoked",
            Denial::Expired => "expired",
            Denial::Exhausted => "exhausted",
            Denial::OutOfSequence => "out-of-sequence",
            Denial::Undeclared => "undeclared",
            Denial::Capacity => "capacity",
            Denial::InvalidLease => "invalid-lease",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct AuthorizedCall {
    pub(crate) principal: u64,
    pub(crate) operation: Operation,
    pub(crate) resource: Resource,
    pub(crate) sequence: u64,
}

#[derive(Clone, Copy)]
pub(crate) struct Limits {
    pub(crate) lease_ttl: u64,
    pub(crate) request_budget: u32,
    pub(crate) max_live_leases: usize,
    pub(crate) audit_capacity: usize,
}

struct Lease {
    principal: u64,
    declarations: BTreeSet<(Operation, Resource)>,
    next_sequence: u64,
    expires_at: u64,
    remaining: u32,
    revoked: bool,
}

pub(crate) struct PolicyCore {
    limits: Limits,
    leases: HashMap<LeaseId, Lease>,
    audit: VecDeque<AuditEvent>,
    next_audit_index: u64,
}

impl PolicyCore {
    pub(crate) fn new(limits: Limits) -> Self {
        Self {
            limits,
            leases: HashMap::new(),
            audit: VecDeque::with_capacity(limits.audit_capacity),
            next_audit_index: 0,
        }
    }

    pub(crate) fn issue(
        &mut self,
        caller_label: &str,
        identity: HostIdentity,
        id: LeaseId,
        now: u64,
    ) -> Result<LeaseId, Denial> {
        if caller_label != BROKER_LABEL {
            return Err(Denial::WrongCaller);
        }
        self.remove_expired(now);
        let result = if self.limits.request_budget == 0
            || self.limits.lease_ttl == 0
            || self.leases.contains_key(&id)
        {
            Err(Denial::InvalidLease)
        } else if self.leases.len() >= self.limits.max_live_leases {
            Err(Denial::Capacity)
        } else if let Some(expires_at) = now.checked_add(self.limits.lease_ttl) {
            let principal = identity.audit_id;
            self.leases.insert(
                id,
                Lease {
                    principal,
                    declarations: identity.declarations,
                    next_sequence: 0,
                    expires_at,
                    remaining: self.limits.request_budget,
                    revoked: false,
                },
            );
            self.record(now, Some(principal), None, None, None, Decision::Issued);
            Ok(id)
        } else {
            Err(Denial::InvalidLease)
        };
        if let Err(reason) = result {
            self.record(now, None, None, None, None, Decision::Denied(reason));
        }
        result
    }

    // Keep the protocol fields separate until the Tauri envelope type exists;
    // grouping them prematurely would make this pure core deserialize input.
    // Both unwraps below are dominated by the explicit unknown-name refusals.
    #[allow(clippy::too_many_arguments, clippy::unnecessary_unwrap)]
    pub(crate) fn authorize(
        &mut self,
        caller_label: &str,
        id: LeaseId,
        sequence: u64,
        operation_name: &str,
        resource_name: &str,
        args: &Value,
        now: u64,
    ) -> Result<AuthorizedCall, Denial> {
        let operation = Operation::parse(operation_name);
        let resource = Resource::parse(resource_name);
        let principal = self.leases.get(&id).map(|lease| lease.principal);
        let denial = if caller_label != BROKER_LABEL {
            Some(Denial::WrongCaller)
        } else if operation.is_none() {
            Some(Denial::UnknownOperation)
        } else if resource.is_none() {
            Some(Denial::UnknownResource)
        } else if !matches!(args, Value::Object(map) if map.is_empty()) {
            Some(Denial::MalformedArguments)
        } else {
            match self.leases.get(&id) {
                None => Some(Denial::UnknownLease),
                Some(lease) if lease.revoked => Some(Denial::Revoked),
                Some(lease) if now >= lease.expires_at => Some(Denial::Expired),
                Some(lease) if lease.remaining == 0 => Some(Denial::Exhausted),
                Some(lease) if sequence != lease.next_sequence => Some(Denial::OutOfSequence),
                Some(lease)
                    if !lease
                        .declarations
                        .contains(&(operation.unwrap(), resource.unwrap())) =>
                {
                    Some(Denial::Undeclared)
                }
                Some(_) => None,
            }
        };

        if let Some(reason) = denial {
            self.record(
                now,
                principal,
                operation,
                resource,
                Some(sequence),
                Decision::Denied(reason),
            );
            return Err(reason);
        }

        let lease = self.leases.get_mut(&id).expect("lease checked above");
        let call = AuthorizedCall {
            principal: lease.principal,
            operation: operation.unwrap(),
            resource: resource.unwrap(),
            sequence,
        };
        // Consume before any platform executor can run. A failed executor must
        // not make a potentially side-effecting request replayable.
        lease.remaining -= 1;
        lease.next_sequence = match lease.next_sequence.checked_add(1) {
            Some(next) => next,
            None => {
                lease.revoked = true;
                self.record(
                    now,
                    principal,
                    operation,
                    resource,
                    Some(sequence),
                    Decision::Denied(Denial::Exhausted),
                );
                return Err(Denial::Exhausted);
            }
        };
        self.record(
            now,
            principal,
            operation,
            resource,
            Some(sequence),
            Decision::Allowed,
        );
        Ok(call)
    }

    pub(crate) fn revoke(
        &mut self,
        caller_label: &str,
        id: LeaseId,
        now: u64,
    ) -> Result<bool, Denial> {
        if caller_label != BROKER_LABEL {
            return Err(Denial::WrongCaller);
        }
        let principal = self.leases.get(&id).map(|lease| lease.principal);
        let revoked = if let Some(lease) = self.leases.get_mut(&id) {
            let changed = !lease.revoked;
            lease.revoked = true;
            changed
        } else {
            false
        };
        if revoked {
            self.record(now, principal, None, None, None, Decision::Revoked);
        }
        Ok(revoked)
    }

    pub(crate) fn revoke_principal(
        &mut self,
        caller_label: &str,
        principal: u64,
        now: u64,
    ) -> Result<usize, Denial> {
        if caller_label != BROKER_LABEL {
            return Err(Denial::WrongCaller);
        }
        let mut count = 0;
        for lease in self.leases.values_mut() {
            if lease.principal == principal && !lease.revoked {
                lease.revoked = true;
                count += 1;
            }
        }
        for _ in 0..count {
            self.record(now, Some(principal), None, None, None, Decision::Revoked);
        }
        Ok(count)
    }

    pub(crate) fn revoke_all(&mut self, caller_label: &str, now: u64) -> Result<usize, Denial> {
        if caller_label != BROKER_LABEL {
            return Err(Denial::WrongCaller);
        }
        let mut principals = Vec::new();
        for lease in self.leases.values_mut() {
            if !lease.revoked {
                lease.revoked = true;
                principals.push(lease.principal);
            }
        }
        for principal in &principals {
            self.record(now, Some(*principal), None, None, None, Decision::Revoked);
        }
        Ok(principals.len())
    }

    pub(crate) fn audit(&self) -> impl Iterator<Item = &AuditEvent> {
        self.audit.iter()
    }

    fn remove_expired(&mut self, now: u64) {
        self.leases.retain(|_, lease| lease.expires_at > now);
    }

    fn record(
        &mut self,
        at: u64,
        principal: Option<u64>,
        operation: Option<Operation>,
        resource: Option<Resource>,
        sequence: Option<u64>,
        decision: Decision,
    ) {
        if self.limits.audit_capacity == 0 {
            return;
        }
        if self.audit.len() == self.limits.audit_capacity {
            self.audit.pop_front();
        }
        let index = self.next_audit_index;
        self.next_audit_index = self.next_audit_index.saturating_add(1);
        self.audit.push_back(AuditEvent {
            index,
            at,
            principal,
            operation,
            resource,
            sequence,
            decision,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn limits() -> Limits {
        Limits {
            lease_ttl: 10,
            request_budget: 2,
            max_live_leases: 2,
            audit_capacity: 8,
        }
    }
    fn id(byte: u8) -> LeaseId {
        LeaseId::from_host_random([byte; 32])
    }
    fn declared(principal: u64) -> HostIdentity {
        HostIdentity::new(
            principal,
            [(Operation::PlatformKindRead, Resource::PlatformDefault)],
        )
    }
    fn empty() -> Value {
        json!({})
    }
    fn request(
        core: &mut PolicyCore,
        lease: LeaseId,
        seq: u64,
        now: u64,
    ) -> Result<AuthorizedCall, Denial> {
        core.authorize(
            BROKER_LABEL,
            lease,
            seq,
            "platform.kind.read",
            "platform/default",
            &empty(),
            now,
        )
    }

    #[test]
    fn allows_declared_exact_sequence_and_consumes_it() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(7), id(1), 5).unwrap();
        assert_eq!(request(&mut core, lease, 0, 5).unwrap().principal, 7);
        assert_eq!(request(&mut core, lease, 1, 5).unwrap().sequence, 1);
        assert_eq!(request(&mut core, lease, 2, 5), Err(Denial::Exhausted));
    }

    #[test]
    fn rejects_wrong_caller_unknown_names_and_nonempty_or_nonobject_args() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(1), id(1), 0).unwrap();
        assert_eq!(
            core.authorize(
                "main",
                lease,
                0,
                "platform.kind.read",
                "platform/default",
                &empty(),
                0
            ),
            Err(Denial::WrongCaller)
        );
        assert_eq!(
            core.authorize(
                BROKER_LABEL,
                lease,
                0,
                "unknown",
                "platform/default",
                &empty(),
                0
            ),
            Err(Denial::UnknownOperation)
        );
        assert_eq!(
            core.authorize(
                BROKER_LABEL,
                lease,
                0,
                "platform.kind.read",
                "unknown",
                &empty(),
                0
            ),
            Err(Denial::UnknownResource)
        );
        for args in [json!({"extra": 1}), json!(null), json!([])] {
            assert_eq!(
                core.authorize(
                    BROKER_LABEL,
                    lease,
                    0,
                    "platform.kind.read",
                    "platform/default",
                    &args,
                    0
                ),
                Err(Denial::MalformedArguments)
            );
        }
        assert!(request(&mut core, lease, 0, 0).is_ok());
    }

    #[test]
    fn undeclared_is_default_deny() {
        let mut core = PolicyCore::new(limits());
        let lease = core
            .issue(BROKER_LABEL, HostIdentity::new(1, []), id(1), 0)
            .unwrap();
        assert_eq!(request(&mut core, lease, 0, 0), Err(Denial::Undeclared));
    }

    #[test]
    fn replay_and_high_sequence_do_not_advance_expected_sequence() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(1), id(1), 0).unwrap();
        assert_eq!(request(&mut core, lease, 99, 0), Err(Denial::OutOfSequence));
        assert!(request(&mut core, lease, 0, 0).is_ok());
        assert_eq!(request(&mut core, lease, 0, 0), Err(Denial::OutOfSequence));
        assert!(request(&mut core, lease, 1, 0).is_ok());
    }

    #[test]
    fn expiry_boundary_and_revocation_are_enforced() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(1), id(1), 5).unwrap();
        assert!(request(&mut core, lease, 0, 14).is_ok());
        assert_eq!(request(&mut core, lease, 1, 15), Err(Denial::Expired));
        let other = core.issue(BROKER_LABEL, declared(2), id(2), 15).unwrap();
        assert!(core.revoke(BROKER_LABEL, other, 16).unwrap());
        assert!(!core.revoke(BROKER_LABEL, other, 16).unwrap());
        assert_eq!(request(&mut core, other, 0, 16), Err(Denial::Revoked));
    }

    #[test]
    fn principal_revocation_covers_all_its_leases_only() {
        let mut core = PolicyCore::new(Limits {
            max_live_leases: 3,
            ..limits()
        });
        let a = core.issue(BROKER_LABEL, declared(4), id(1), 0).unwrap();
        let b = core.issue(BROKER_LABEL, declared(4), id(2), 0).unwrap();
        let c = core.issue(BROKER_LABEL, declared(5), id(3), 0).unwrap();
        assert_eq!(core.revoke_principal(BROKER_LABEL, 4, 1), Ok(2));
        assert_eq!(request(&mut core, a, 0, 1), Err(Denial::Revoked));
        assert_eq!(request(&mut core, b, 0, 1), Err(Denial::Revoked));
        assert!(request(&mut core, c, 0, 1).is_ok());
    }

    #[test]
    fn live_cap_duplicate_invalid_limits_and_expiry_compaction() {
        let mut core = PolicyCore::new(Limits {
            max_live_leases: 1,
            ..limits()
        });
        core.issue(BROKER_LABEL, declared(1), id(1), 0).unwrap();
        assert_eq!(
            core.issue(BROKER_LABEL, declared(2), id(2), 0),
            Err(Denial::Capacity)
        );
        assert!(core.issue(BROKER_LABEL, declared(2), id(2), 10).is_ok());
        assert_eq!(
            core.issue(BROKER_LABEL, declared(3), id(2), 10),
            Err(Denial::InvalidLease)
        );
        for bad in [
            Limits {
                lease_ttl: 0,
                ..limits()
            },
            Limits {
                request_budget: 0,
                ..limits()
            },
        ] {
            assert_eq!(
                PolicyCore::new(bad).issue(BROKER_LABEL, declared(1), id(9), 0),
                Err(Denial::InvalidLease)
            );
        }
        assert_eq!(
            PolicyCore::new(limits()).issue(BROKER_LABEL, declared(1), id(9), u64::MAX),
            Err(Denial::InvalidLease)
        );
    }

    #[test]
    fn audit_is_bounded_attributed_and_contains_no_lease_or_arguments() {
        let mut core = PolicyCore::new(Limits {
            audit_capacity: 2,
            ..limits()
        });
        let lease = core.issue(BROKER_LABEL, declared(42), id(0xAB), 0).unwrap();
        let _ = request(&mut core, lease, 8, 1);
        let _ = request(&mut core, lease, 0, 2);
        let events: Vec<_> = core.audit().cloned().collect();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].index, 1);
        assert!(events.iter().all(|event| event.principal == Some(42)));
        let rendered = format!("{events:?}");
        assert!(!rendered.contains("171"));
        assert!(!rendered.contains("extra"));
        assert_eq!(format!("{:?}", lease), "LeaseId([REDACTED])");
    }

    #[test]
    fn zero_audit_capacity_retains_nothing() {
        let mut core = PolicyCore::new(Limits {
            audit_capacity: 0,
            ..limits()
        });
        core.issue(BROKER_LABEL, declared(1), id(1), 0).unwrap();
        assert_eq!(core.audit().count(), 0);
    }

    #[test]
    fn main_cannot_issue_and_failed_attempt_has_no_side_effects() {
        let mut core = PolicyCore::new(limits());
        assert_eq!(
            core.issue("main", declared(1), id(1), 0),
            Err(Denial::WrongCaller)
        );
        assert_eq!(core.audit().count(), 0);
        assert!(core.issue(BROKER_LABEL, declared(1), id(1), 0).is_ok());
    }

    #[test]
    fn main_cannot_revoke_one_and_valid_lease_remains_usable() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(7), id(1), 0).unwrap();
        let audit_len = core.audit().count();
        assert_eq!(core.revoke("main", lease, 1), Err(Denial::WrongCaller));
        assert_eq!(core.audit().count(), audit_len);
        assert!(request(&mut core, lease, 0, 1).is_ok());
    }

    #[test]
    fn main_cannot_revoke_principal_and_valid_lease_remains_usable() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(7), id(1), 0).unwrap();
        let audit_len = core.audit().count();
        assert_eq!(
            core.revoke_principal("main", 7, 1),
            Err(Denial::WrongCaller)
        );
        assert_eq!(core.audit().count(), audit_len);
        assert!(request(&mut core, lease, 0, 1).is_ok());
    }

    #[test]
    fn main_cannot_revoke_all_and_valid_leases_remain_usable() {
        let mut core = PolicyCore::new(limits());
        let lease = core.issue(BROKER_LABEL, declared(7), id(1), 0).unwrap();
        let audit_len = core.audit().count();
        assert_eq!(core.revoke_all("main", 1), Err(Denial::WrongCaller));
        assert_eq!(core.audit().count(), audit_len);
        assert!(request(&mut core, lease, 0, 1).is_ok());
    }

    #[test]
    fn broker_revoke_all_covers_every_principal_and_is_idempotent() {
        let mut core = PolicyCore::new(limits());
        let first = core.issue(BROKER_LABEL, declared(7), id(1), 0).unwrap();
        let second = core.issue(BROKER_LABEL, declared(8), id(2), 0).unwrap();
        assert_eq!(core.revoke_all(BROKER_LABEL, 1), Ok(2));
        assert_eq!(core.revoke_all(BROKER_LABEL, 2), Ok(0));
        assert_eq!(request(&mut core, first, 0, 2), Err(Denial::Revoked));
        assert_eq!(request(&mut core, second, 0, 2), Err(Denial::Revoked));
    }

    #[test]
    fn managed_state_sanitizes_a_poisoned_lock() {
        let state = NativePolicyState::new();
        let inner = state.inner.clone();
        let _ = std::thread::spawn(move || {
            let _guard = inner.core.lock().unwrap();
            panic!("poison for test");
        })
        .join();
        assert_eq!(state.revoke_all(BROKER_LABEL), Err(StateError::Unavailable));
    }
}
