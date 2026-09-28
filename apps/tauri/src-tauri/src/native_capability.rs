//! Closed semantic native operations for platform inspection and emulation.
//!
//! Transport lives in `native_broker_adapter`; policy lives in `native_policy`. This module is
//! the seam between them, and it is deliberately thin — it binds the caller label, hands the
//! decision to the policy core, and executes only reviewed semantic actions. Nothing here
//! interprets caller-supplied capability, and no reusable invoke handle is ever returned.

use crate::native_policy::{LeaseId, NativePolicyState, Operation, RedactedAuditRow, StateError};
use crate::renode_debugger::{RenodeDebugger, RenodeTarget};
use crate::renode_supervisor::RenodeSupervisor;
use serde_json::Value;
use tauri::{State, WebviewWindow};

const BROKER_LABEL: &str = "capability-broker";
const MAIN_LABEL: &str = "main";

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

/// Closed semantic executor. Platform inspection stays side-effect free; Renode operations can
/// only reach the target-matched managed debugger and its build-pinned supervisor.
/// No caller string becomes a path, process argument, monitor command, port or token.
fn execute(
    operation: Operation,
    args: &Value,
    debugger: &RenodeDebugger,
    supervisor: &RenodeSupervisor,
) -> Result<String, String> {
    let spike = || debugger.ensure_target(RenodeTarget::SpikePrime);
    let ev3 = || debugger.ensure_target(RenodeTarget::Ev3);
    match operation {
        Operation::PlatformKindRead => Ok(if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else {
            "linux"
        }
        .to_owned()),
        Operation::RenodeSpikeStart => debugger.start(supervisor).map(str::to_owned),
        Operation::RenodeSpikeClose => {
            spike()?;
            debugger.close(supervisor).map(str::to_owned)
        }
        Operation::RenodeSpikeRun => {
            spike()?;
            debugger.run().map(str::to_owned)
        }
        Operation::RenodeSpikePause => {
            spike()?;
            debugger.pause().map(str::to_owned)
        }
        Operation::RenodeSpikeReset => {
            spike()?;
            debugger.reset(supervisor).map(str::to_owned)
        }
        Operation::RenodeSpikeStep => {
            spike()?;
            debugger.step().map(str::to_owned)
        }
        Operation::RenodeSpikeRegistersRead => {
            spike()?;
            debugger.registers().map(|value| value.to_string())
        }
        Operation::RenodeSpikeMemoryRead => {
            spike()?;
            debugger.read_memory(
                u32::try_from(args["address"].as_u64().expect("validated address"))
                    .expect("bounded address"),
                usize::try_from(args["length"].as_u64().expect("validated length"))
                    .expect("bounded length"),
            )
        }
        Operation::RenodeSpikeStateRead => {
            spike()?;
            debugger.state().map(|value| value.to_string())
        }
        Operation::RenodeSpikeBreakpointSet => {
            spike()?;
            debugger
                .set_breakpoint(
                    u32::try_from(args["address"].as_u64().expect("validated address"))
                        .expect("bounded address"),
                )
                .map(str::to_owned)
        }
        Operation::RenodeSpikeBreakpointClear => {
            spike()?;
            debugger
                .clear_breakpoint(
                    u32::try_from(args["address"].as_u64().expect("validated address"))
                        .expect("bounded address"),
                )
                .map(str::to_owned)
        }
        Operation::RenodeEv3Start => debugger.start_ev3(supervisor).map(str::to_owned),
        Operation::RenodeEv3Close => {
            ev3()?;
            debugger.close(supervisor).map(str::to_owned)
        }
        Operation::RenodeEv3Run => {
            ev3()?;
            debugger.run().map(str::to_owned)
        }
        Operation::RenodeEv3Pause => {
            ev3()?;
            debugger.pause().map(str::to_owned)
        }
        Operation::RenodeEv3Reset => {
            ev3()?;
            debugger.reset(supervisor).map(str::to_owned)
        }
        Operation::RenodeEv3Step => {
            ev3()?;
            debugger.step().map(str::to_owned)
        }
        Operation::RenodeEv3RegistersRead => {
            ev3()?;
            debugger.registers().map(|value| value.to_string())
        }
        Operation::RenodeEv3MemoryRead => {
            ev3()?;
            debugger.read_memory(
                u32::try_from(args["address"].as_u64().expect("validated address"))
                    .expect("bounded address"),
                usize::try_from(args["length"].as_u64().expect("validated length"))
                    .expect("bounded length"),
            )
        }
        Operation::RenodeEv3StateRead => {
            ev3()?;
            debugger.state().map(|value| value.to_string())
        }
        Operation::RenodeEv3BreakpointSet => {
            ev3()?;
            debugger
                .set_breakpoint(
                    u32::try_from(args["address"].as_u64().expect("validated address"))
                        .expect("bounded address"),
                )
                .map(str::to_owned)
        }
        Operation::RenodeEv3BreakpointClear => {
            ev3()?;
            debugger
                .clear_breakpoint(
                    u32::try_from(args["address"].as_u64().expect("validated address"))
                        .expect("bounded address"),
                )
                .map(str::to_owned)
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
#[allow(clippy::too_many_arguments)] // Tauri injects the three managed State parameters.
pub(crate) fn native_broker_invoke(
    window: WebviewWindow,
    policy: State<'_, NativePolicyState>,
    debugger: State<'_, RenodeDebugger>,
    supervisor: State<'_, RenodeSupervisor>,
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
    execute(call.operation, &args, &debugger, &supervisor)
}

/// Diagnostics. Readable from the MAIN webview because that is where the learner sees it, and
/// safe to read there because the row type has no field that could carry a secret: no pin
/// source, no digest, no lease id, no correlation id, no raw arguments and no result. It is a
/// READ — it cannot issue, authorise or revoke anything — so granting it to the editor widens
/// what the editor can SEE and not what it can DO.
#[tauri::command]
pub(crate) fn native_broker_audit(
    window: WebviewWindow,
    policy: State<'_, NativePolicyState>,
) -> Result<Vec<RedactedAuditRow>, String> {
    if window.label() != MAIN_LABEL {
        return Err("capability refused".into());
    }
    policy.redacted_audit().map_err(opaque)
}
