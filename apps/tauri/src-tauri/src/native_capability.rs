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
use tauri::{Manager, State, WebviewWindow};

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
    choose_image: impl FnOnce() -> Result<Option<crate::spike_local_image::AdmittedImage>, String>,
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
        Operation::RenodeSpikeImageChoose => {
            supervisor.micropython_support_root()?;
            if option_env!("BW_RENODE_MICROPYTHON_MANIFEST_SHA256").is_none() {
                return Err("MicroPython support is not packaged in this desktop build".into());
            }
            debugger.choose_micropython_image(choose_image).map(str::to_owned)
        }
        Operation::RenodeSpikeStart => {
            if args["backend"] == "micropython" {
                return debugger.start_chosen_micropython_profile(supervisor,
                    crate::renode_supervisor::SpikeTopology::parse(args["topology"].as_str())?).map(str::to_owned);
            }
            use crate::renode_supervisor::SpikeTopology;
            let topology = SpikeTopology::parse(args["topology"].as_str())?;
            match (topology, args["backend"].as_str()) {
                (SpikeTopology::Default, None) => debugger.start(supervisor),
                (SpikeTopology::Default, backend) => debugger.start_spike_backend(supervisor, backend),
                (SpikeTopology::SixMotors | SpikeTopology::DualUltrasonic, backend) => debugger.start_spike_profile(supervisor, backend, topology),
            }.map(str::to_owned)
        }
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
        Operation::RenodeSpikeProgramStorageSubmit => {
            spike()?;
            debugger.spike_program_storage_submit(args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeUartRead => {
            spike()?;
            debugger.spike_program_uart("micropython.uart.read", args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeUartWrite => {
            spike()?;
            debugger.spike_program_uart("micropython.uart.write", args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeUartClose => {
            spike()?;
            debugger.spike_program_uart("micropython.uart.close", args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeProgramPacket => {
            spike()?;
            debugger.spike_program_packet(args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeArenaProgram => {
            spike()?;
            debugger.spike_arena_program(args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeArenaInputs => {
            spike()?;
            debugger
                .spike_arena_inputs(args.clone())
                .map(|value| value.to_string())
        }
        Operation::RenodeSpikeLockstepBegin => {
            spike()?;
            let snapshot = debugger.spike_lockstep("lockstep.begin", args.clone())?;
            // Only a session that actually began lockstep gets the longer wall bound.
            if !supervisor.extend_for_lockstep() {
                return Err("Renode session is not active".into());
            }
            Ok(snapshot.to_string())
        }
        Operation::RenodeSpikeProgramControlSubmit => {
            spike()?;
            debugger.spike_program_control(args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeLockstepStep => {
            spike()?;
            debugger.spike_lockstep("lockstep.step", args.clone()).map(|value| value.to_string())
        }
        Operation::RenodeSpikeLockstepEnd => {
            spike()?;
            debugger.spike_lockstep("lockstep.end", args.clone()).map(|value| value.to_string())
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
        Operation::RenodeEv3ButtonSet => {
            ev3()?;
            debugger
                .ev3_input("ev3.button.set", args.clone())
                .map(|value| value.to_string())
        }
        Operation::RenodeEv3AnalogSet => {
            ev3()?;
            debugger
                .ev3_input("ev3.analog.set-channel", args.clone())
                .map(|value| value.to_string())
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
pub(crate) async fn native_broker_invoke(
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
        .consume_broker_call(window.label(), id, sequence, &operation, &resource, &args)
        .map_err(opaque)?;
    // Authorization and caller binding happen before dispatch. The worker owns
    // only the approved typed operation and bounded arguments. Blocking native
    // dialogs and emulator startup must never execute on the UI thread.
    let app = window.app_handle().clone();
    let operation = call.operation;
    tauri::async_runtime::spawn_blocking(move || {
        let debugger = app.state::<RenodeDebugger>();
        let supervisor = app.state::<RenodeSupervisor>();
        execute(operation, &args, &debugger, &supervisor,
            || crate::spike_image_chooser::pick(&app))
    }).await.map_err(|_| "capability unavailable".to_owned())?
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

/// Robot Lab R13e (docs/ROBOT-LAB-SPIKE-EMULATION.md §7): the broker operations the
/// firmware route uses, dispatched exactly as `native_broker_invoke` does after admission
/// (`Operation::parse` → `valid_args` → `execute`), against the build-pinned NuttX package
/// in a real Renode — everything of the desktop path except the webview and the lease.
/// The shafts come from a first-order no-load wheel (no Jolt here); the full physics run is
/// `scripts/verify-sim-lab-renode-lockstep.mjs`.
#[cfg(test)]
mod packaged_lockstep_tests {
    use super::*;
    use serde_json::json;
    use std::time::Instant;

    fn op(name: &str, args: Value, debugger: &RenodeDebugger, supervisor: &RenodeSupervisor) -> Result<String, String> {
        let operation = Operation::parse(name).expect("a broker operation");
        assert!(operation.valid_args(&args), "the broker refuses {name} {args}");
        execute(operation, &args, debugger, supervisor, || Ok(None))
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = 0xffff_ffffu32;
        for &byte in bytes {
            crc ^= u32::from(byte);
            for _ in 0..8 { crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb8_8320 } else { 0 }; }
        }
        !crc
    }

    fn header(op: u8, id: u32, length: usize) -> Vec<u8> {
        let mut packet = vec![0u8; length];
        packet[..4].copy_from_slice(&[0x70, 1, op, 0]);
        packet[4..8].copy_from_slice(&id.to_le_bytes());
        packet
    }

    #[test]
    #[ignore = "requires a build-pinned lockstep-capable NuttX package (scripts/restage-spike-nuttx-package.mjs)"]
    fn packaged_nuttx_firmware_program_runs_in_lockstep() {
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        let started = Instant::now();
        op("renode.spike.session.start", json!({"backend":"nuttx"}), &debugger, &supervisor).unwrap();
        let boot = started.elapsed();
        let first: Value = serde_json::from_str(&op("renode.spike.state.read", json!({}), &debugger, &supervisor).unwrap()).unwrap();
        assert!(first["target"]["capabilities"].as_array().unwrap().iter().any(|c| c == "lockstep/v1"), "{first}");
        op("renode.spike.run", json!({}), &debugger, &supervisor).unwrap();

        // compileFirmwareProgram's output for `start tank 30 30, wait 1.08 seconds, stop movement`.
        let program: [[i32; 4]; 6] = [[1, 0, -333, 0], [1, 1, 333, 0], [2, 1080, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0]];
        let payload: Vec<u8> = program.iter().flatten().flat_map(|w| w.to_le_bytes()).collect();
        let id = 7u32;
        let mut begin = header(0, id, 16);
        begin[8..12].copy_from_slice(&(program.len() as u32).to_le_bytes());
        begin[12..16].copy_from_slice(&crc32(&payload).to_le_bytes());
        let mut packets = vec![begin];
        for (index, chunk) in payload.chunks(10).enumerate() {
            let mut packet = header(1, id, 10 + chunk.len());
            packet[8..10].copy_from_slice(&((index * 10) as u16).to_le_bytes());
            packet[10..].copy_from_slice(chunk);
            packets.push(packet);
        }
        packets.push(header(2, id, 8));
        for packet in packets {
            op("renode.spike.program.packet", json!({"bytes": packet}), &debugger, &supervisor).unwrap();
        }

        let begun: Value = serde_json::from_str(&op("renode.spike.lockstep.begin", json!({"quantumUs":5000}), &debugger, &supervisor).unwrap()).unwrap();
        let mut clock = begun["clockNs"].as_u64().unwrap();
        op("renode.spike.program.control.submit", json!({"bytes": header(3, id, 8)}), &debugger, &supervisor).unwrap();

        // First-order no-load wheels: speed follows duty·1110 °/s with a 50 ms time constant.
        let (mut position, mut speed) = ([0.0f64; 2], [0.0f64; 2]);
        let (mut worst, mut running_seen, mut state) = (0.0f64, false, 0u64);
        let stepping = Instant::now();
        let mut steps = 0u32;
        while steps < 800 {
            let shafts: Vec<Value> = ["A", "B"].iter().enumerate().map(|(i, port)| json!({"port": port,
                "positionMdeg": (position[i] * 1000.0).round() as i64, "speedMdps": (speed[i] * 1000.0).round() as i64})).collect();
            let reply: Value = serde_json::from_str(&op("renode.spike.lockstep.step",
                json!({"quantumUs":5000,"expectClockNs":clock,"shafts":shafts,"sensors":[]}), &debugger, &supervisor).unwrap()).unwrap();
            assert_eq!(reply["clockNs"].as_u64().unwrap(), clock + 5_000_000, "one quantum, exactly");
            clock += 5_000_000;
            steps += 1;
            for (i, port) in ["A", "B"].iter().enumerate() {
                let motor = reply["motors"].as_array().unwrap().iter().find(|m| m["port"] == *port).unwrap();
                assert_eq!(motor["positionSource"], "external", "{motor}");
                assert_eq!(motor["drive"]["ticks"], 5, "{motor}");
                // The emulator's encoder: our shaft at t_k, extrapolated by its speed over the quantum.
                let expected = position[i] + speed[i] * 0.005;
                worst = worst.max((motor["position"].as_f64().unwrap() - expected).abs());
                let duty = motor["drive"]["mean"].as_f64().unwrap() / 10000.0;
                for _ in 0..5 {
                    speed[i] += (duty * 1110.0 - speed[i]) * 0.001 / 0.05;
                    position[i] += speed[i] * 0.001;
                }
            }
            state = reply["lifecycle"]["nuttxProgram"]["state"].as_u64().unwrap_or(0);
            running_seen |= state == 2;
            if running_seen && state != 2 { break; }
        }
        let wall = stepping.elapsed();
        op("renode.spike.lockstep.end", json!({}), &debugger, &supervisor).unwrap();
        op("renode.spike.session.close", json!({}), &debugger, &supervisor).unwrap();
        eprintln!("R13e native: boot {:.1} s; {steps} steps ({} ms) in {:.1} s wall (RTF {:.3}); wheels A {:.1}°, B {:.1}°; worst encoder vs shaft {:.4}°; program state {state}",
            boot.as_secs_f64(), steps * 5, wall.as_secs_f64(), f64::from(steps) * 0.005 / wall.as_secs_f64(), position[0], position[1], worst);
        assert!(running_seen && state == 3, "the firmware program ran and completed (state {state})");
        assert!(worst <= 1.0, "the emulator's encoder is the injected shaft within 1° (worst {worst}°)");
        assert!(position[1] > 250.0 && position[0] < -250.0, "the firmware drove both wheels forward: {position:?}");
    }
}
