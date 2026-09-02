//! The first, and so far only, semantic native operation: `platform.kind.read`.
//!
//! Transport lives in `native_broker_adapter`; policy lives in `native_policy`. This module is
//! the seam between them, and it is deliberately thin — it binds the caller label, hands the
//! decision to the policy core, and executes exactly one side-effect-free read. Nothing here
//! interprets caller-supplied capability, and no reusable invoke handle is ever returned.

use crate::native_policy::{LeaseId, NativePolicyState, Operation, StateError};
use serde_json::Value;
use tauri::{State, WebviewWindow};

const BROKER_LABEL: &str = "capability-broker";

fn broker_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == BROKER_LABEL {
        Ok(())
    } else {
        // The editor realm reaching this at all is the case the whole checkpoint exists to
        // refuse, and it gets the same opaque string as every other denial: a caller must not
        // learn from the error whether the lease, the sequence or the CALLER was the problem.
        Err("capability refused".into())
    }
}

fn opaque(_: StateError) -> String {
    "capability refused".into()
}

/// The single executor. Side-effect free, argument free, and constant per build — reading it
/// twice cannot reveal anything a caller did not already know from the binary it is running.
fn execute(operation: Operation) -> &'static str {
    match operation {
        Operation::PlatformKindRead => {
            if cfg!(target_os = "macos") {
                "macos"
            } else if cfg!(target_os = "windows") {
                "windows"
            } else {
                "linux"
            }
        }
    }
}

#[tauri::command]
pub(crate) fn native_broker_lease(
    window: WebviewWindow,
    policy: State<'_, NativePolicyState>,
) -> Result<String, String> {
    broker_only(&window)?;
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|_| "capability unavailable".to_owned())?;
    // The audit id is host-derived from the same draw, so a caller cannot choose the principal
    // it will be recorded as. It is non-secret and only ever appears in redacted audit rows.
    let audit_id = u64::from_le_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]);
    policy
        .issue_broker_lease(window.label(), audit_id, LeaseId::from_host_random(bytes))
        .map(|id| id.to_hex())
        .map_err(opaque)
}

#[tauri::command]
pub(crate) fn native_broker_invoke(
    window: WebviewWindow,
    policy: State<'_, NativePolicyState>,
    lease: String,
    sequence: u64,
    operation: String,
    resource: String,
    args: Value,
) -> Result<String, String> {
    broker_only(&window)?;
    // A malformed lease string is refused HERE rather than coerced: parse_hex demands exactly
    // 64 lowercase hex characters, so a truncated or upper-cased id is not a near miss that
    // some later comparison might accept.
    let id = LeaseId::parse_hex(&lease).ok_or_else(|| "capability refused".to_owned())?;
    let call = policy
        .authorize_broker_call(window.label(), id, sequence, &operation, &resource, &args)
        .map_err(opaque)?;
    Ok(execute(call.operation).to_owned())
}
