//! Semantic owner for optional architecture-aware Renode sessions.
//!
//! It returns status words only. Ports, tokens, paths and process handles stay
//! in native state and cannot cross into either webview.

use crate::renode_brick_state::BrickStateFeed;
use crate::renode_rsp::{Arm32Architecture, RenodeRsp, RenodeRspInterrupt};
use crate::renode_supervisor::{RenodeSupervisor, SpikeTopology, TeardownReason};
use serde_json::{json, Value};
use std::io::Read;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

// Parsing the exact STM32F413 platform and its SVD can take more than five
// seconds on a cold CI worker. Keep this below the supervisor's hard session
// limit while allowing the real packaged model to finish starting.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
// The minimal simulation guest avoids remote SVD loading, but cold Renode
// startup exceeded 30 seconds on a busy host. The supervisor still enforces
// its 120-second wall limit for the complete owned session.
const SPIKE_STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const EV3_UART_EVIDENCE: &[u8] = b"EV3 ARM9 IRQ\n";

struct Session {
    rsp: Arc<Mutex<RenodeRsp>>,
    interrupt: RenodeRspInterrupt,
    running: Arc<AtomicBool>,
    target: RenodeTarget,
    backend: Option<String>,
    topology: SpikeTopology,
    state: TargetState,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RenodeTarget {
    SpikePrime,
    Ev3,
}

impl RenodeTarget {
    fn architecture(self) -> Arm32Architecture {
        match self {
            Self::SpikePrime => Arm32Architecture::CortexM,
            Self::Ev3 => Arm32Architecture::Arm,
        }
    }

    fn status_name(self) -> &'static str {
        match self {
            Self::SpikePrime => "xpsr",
            Self::Ev3 => "cpsr",
        }
    }
}

enum TargetState {
    Spike(BrickStateFeed),
    Ev3 { feed: BrickStateFeed, uart: PathBuf },
}

pub(crate) struct RenodeDebugger {
    session: Mutex<Option<Session>>,
}

impl RenodeDebugger {
    pub(crate) fn new() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }

    pub(crate) fn start(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::SpikePrime, None, SpikeTopology::Default)
    }

    pub(crate) fn start_spike_backend(
        &self,
        supervisor: &RenodeSupervisor,
        backend: Option<&str>,
    ) -> Result<&'static str, String> {
        self.start_spike_profile(supervisor, backend, SpikeTopology::Default)
    }

    pub(crate) fn start_spike_profile(&self, supervisor: &RenodeSupervisor, backend: Option<&str>,
        topology: SpikeTopology) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::SpikePrime, backend, topology)
    }

    pub(crate) fn start_ev3(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::Ev3, None, SpikeTopology::Default)
    }

    fn start_target(
        &self,
        supervisor: &RenodeSupervisor,
        target: RenodeTarget,
        backend: Option<&str>,
        topology: SpikeTopology,
    ) -> Result<&'static str, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if session.is_some() {
            return Err("Renode debugger already started".into());
        }
        let endpoint = match target {
            RenodeTarget::SpikePrime => supervisor.start_spike_profile(backend, topology)?,
            RenodeTarget::Ev3 => supervisor.start_ev3()?,
        };
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.gdb_port);
        let startup_timeout = match target {
            RenodeTarget::SpikePrime => SPIKE_STARTUP_TIMEOUT,
            RenodeTarget::Ev3 => STARTUP_TIMEOUT,
        };
        let deadline = Instant::now() + startup_timeout;
        let rsp = loop {
            match RenodeRsp::connect_for_architecture(address, target.architecture()) {
                Ok(rsp) => break rsp,
                Err(_) if Instant::now() < deadline => thread::sleep(Duration::from_millis(25)),
                Err(error) => {
                    supervisor.teardown(TeardownReason::Reset);
                    return Err(error);
                }
            }
        };
        let interrupt = match rsp.interrupt_handle() {
            Ok(interrupt) => interrupt,
            Err(error) => {
                supervisor.teardown(TeardownReason::Reset);
                return Err(error);
            }
        };
        let state = match target {
            RenodeTarget::SpikePrime => {
                let state_address =
                    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.state_port);
                let state_deadline = Instant::now() + SPIKE_STARTUP_TIMEOUT;
                let feed = loop {
                    match BrickStateFeed::connect(state_address) {
                        Ok(state) => match state.wait_ready(Duration::from_secs(2)) {
                            Ok(()) => break state,
                            Err(error) => {
                                supervisor.teardown(TeardownReason::Reset);
                                return Err(error);
                            }
                        },
                        Err(_) if Instant::now() < state_deadline => {
                            thread::sleep(Duration::from_millis(25))
                        }
                        Err(error) => {
                            supervisor.teardown(TeardownReason::Reset);
                            return Err(error);
                        }
                    }
                };
                TargetState::Spike(feed)
            }
            RenodeTarget::Ev3 => {
                let state_address =
                    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.state_port);
                let state_deadline = Instant::now() + STARTUP_TIMEOUT;
                let feed = loop {
                    match BrickStateFeed::connect(state_address) {
                        Ok(feed) => {
                            if let Err(error) = feed.wait_ready(Duration::from_secs(2)) {
                                supervisor.teardown(TeardownReason::Reset);
                                return Err(error);
                            }
                            if feed.latest()?.target.board != "ev3" {
                                supervisor.teardown(TeardownReason::Reset);
                                return Err("EV3 state target mismatch".into());
                            }
                            break feed;
                        }
                        Err(_) if Instant::now() < state_deadline => {
                            thread::sleep(Duration::from_millis(25))
                        }
                        Err(error) => {
                            supervisor.teardown(TeardownReason::Reset);
                            return Err(error);
                        }
                    }
                };
                TargetState::Ev3 {
                    feed,
                    uart: endpoint
                        .uart_evidence()
                        .ok_or_else(|| "EV3 UART evidence unavailable".to_owned())?
                        .to_path_buf(),
                }
            }
        };
        *session = Some(Session {
            rsp: Arc::new(Mutex::new(rsp)),
            interrupt,
            running: Arc::new(AtomicBool::new(false)),
            target,
            backend: backend.map(str::to_owned),
            topology,
            state,
        });
        Ok("ready")
    }

    pub(crate) fn close(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if let Some(active) = session.as_mut() {
            if active.running.load(Ordering::Acquire) {
                let _ = active.interrupt.request();
            }
        }
        session.take();
        supervisor.teardown(TeardownReason::ProjectClose);
        Ok("closed")
    }

    pub(crate) fn ensure_target(&self, expected: RenodeTarget) -> Result<(), String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        match session.as_ref() {
            Some(active) if active.target == expected => Ok(()),
            Some(_) => Err("Renode debugger target does not match the operation".into()),
            None => Err("Renode debugger is not started".into()),
        }
    }

    pub(crate) fn reset(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        let (target, backend, topology) = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "Renode debugger unavailable".to_owned())?;
            let target = session
                .as_ref()
                .map(|active| (active.target, active.backend.clone(), active.topology));
            if let Some(active) = session.as_mut() {
                if active.running.load(Ordering::Acquire) {
                    let _ = active.interrupt.request();
                }
            }
            session.take();
            target.ok_or_else(|| "Renode debugger is not started".to_owned())?
        };
        supervisor.teardown(TeardownReason::Reset);
        self.start_target(supervisor, target, backend.as_deref(), topology)?;
        Ok("reset")
    }

    fn idle_rsp(&self) -> Result<(Arc<Mutex<RenodeRsp>>, RenodeTarget), String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        if active.running.load(Ordering::Acquire) {
            return Err("Renode debugger is running".into());
        }
        Ok((Arc::clone(&active.rsp), active.target))
    }

    pub(crate) fn registers(&self) -> Result<Value, String> {
        let (rsp, target) = self.idle_rsp()?;
        let registers = rsp
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .registers()?;
        let mut result = serde_json::Map::new();
        for index in 0..13 {
            result.insert(format!("r{index}"), json!(registers.r[index]));
        }
        result.insert("sp".into(), json!(registers.r[13]));
        result.insert("lr".into(), json!(registers.r[14]));
        result.insert("pc".into(), json!(registers.r[15]));
        result.insert(target.status_name().into(), json!(registers.status));
        Ok(Value::Object(result))
    }

    pub(crate) fn read_memory(&self, address: u32, length: usize) -> Result<String, String> {
        let (rsp, _) = self.idle_rsp()?;
        let bytes = rsp
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .read_memory(address, length)?;
        Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }

    pub(crate) fn set_breakpoint(&self, address: u32) -> Result<&'static str, String> {
        let (rsp, _) = self.idle_rsp()?;
        rsp.lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .set_breakpoint(address)?;
        Ok("set")
    }

    pub(crate) fn clear_breakpoint(&self, address: u32) -> Result<&'static str, String> {
        let (rsp, _) = self.idle_rsp()?;
        rsp.lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .clear_breakpoint(address)?;
        Ok("cleared")
    }

    pub(crate) fn step(&self) -> Result<&'static str, String> {
        let (rsp, _) = self.idle_rsp()?;
        rsp.lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .step()?;
        Ok("stopped")
    }

    pub(crate) fn run(&self) -> Result<&'static str, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        if active.running.swap(true, Ordering::AcqRel) {
            return Err("Renode debugger is already running".into());
        }
        let rsp = Arc::clone(&active.rsp);
        let running = Arc::clone(&active.running);
        let (started_tx, started_rx) = mpsc::sync_channel(1);
        thread::spawn(move || {
            if let Ok(mut rsp) = rsp.lock() {
                let _ = rsp.resume_started(Some(started_tx));
            } else {
                let _ = started_tx.send(Err("Renode debugger RSP lock unavailable".into()));
            }
            running.store(false, Ordering::Release);
        });
        match started_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => Ok("running"),
            Ok(Err(error)) => Err(format!("Renode debugger failed to run: {error}")),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                Err("Renode debugger failed to run: continue acknowledgement timed out".into())
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("Renode debugger failed to run: start worker disconnected".into())
            }
        }
    }

    pub(crate) fn pause(&self) -> Result<&'static str, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_mut()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        if !active.running.load(Ordering::Acquire) {
            return Ok("paused");
        }
        active.interrupt.request()?;
        let deadline = Instant::now() + Duration::from_secs(2);
        while active.running.load(Ordering::Acquire) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(5));
        }
        if active.running.load(Ordering::Acquire) {
            Err("Renode debugger pause timed out".into())
        } else {
            Ok("paused")
        }
    }

    pub(crate) fn state(&self) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Spike(state) => {
                let latest = state.latest()?;
                let snapshot = if latest
                    .target
                    .capabilities
                    .iter()
                    .any(|cap| cap == "state-sample/v1")
                {
                    state.sample()?
                } else {
                    latest
                };
                serde_json::to_value(snapshot)
                    .map_err(|_| "brick-state snapshot unavailable".to_owned())
            }
            TargetState::Ev3 { feed, uart: path } => {
                let mut state = serde_json::to_value(feed.sample()?)
                    .map_err(|_| "EV3 snapshot unavailable".to_owned())?;
                state["target"]["architecture"] = "arm926ej-s".into();
                // UART is optional bounded diagnostic evidence, never the
                // authority for GPIO/display/motor/sensor state.
                let mut uart = Vec::new();
                if let Ok(file) = std::fs::File::open(path) {
                    let _ = file.take(1024).read_to_end(&mut uart);
                }
                if uart == EV3_UART_EVIDENCE {
                    state["evidence"] = json!({"uart":"EV3 ARM9 IRQ\n","aintcIrq":true});
                }
                Ok(state)
            }
        }
    }

    pub(crate) fn spike_program_packet(&self, arguments: Value) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Spike(feed) => {
                serde_json::to_value(feed.command("nuttx.program.packet", arguments)?)
                    .map_err(|_| "SPIKE snapshot unavailable".to_owned())
            }
            _ => Err("SPIKE program packet target mismatch".into()),
        }
    }

    pub(crate) fn spike_program_storage_submit(&self, arguments: Value) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Spike(feed) => {
                serde_json::to_value(feed.command("nuttx.program.storage.submit", arguments)?)
                    .map_err(|_| "SPIKE snapshot unavailable".to_owned())
            }
            _ => Err("SPIKE program packet target mismatch".into()),
        }
    }

    pub(crate) fn spike_arena_program(&self, arguments: Value) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Spike(feed) => {
                serde_json::to_value(feed.command("arena.program.load", arguments)?)
                    .map_err(|_| "SPIKE snapshot unavailable".to_owned())
            }
            _ => Err("SPIKE arena program target mismatch".into()),
        }
    }

    pub(crate) fn spike_arena_inputs(&self, arguments: Value) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Spike(feed) => {
                serde_json::to_value(feed.command("arena.inputs", arguments)?)
                    .map_err(|_| "SPIKE snapshot unavailable".to_owned())
            }
            _ => Err("SPIKE arena input target mismatch".into()),
        }
    }

    pub(crate) fn ev3_input(&self, name: &str, arguments: Value) -> Result<Value, String> {
        let session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        let active = session
            .as_ref()
            .ok_or_else(|| "Renode debugger is not started".to_owned())?;
        match &active.state {
            TargetState::Ev3 { feed, .. } => serde_json::to_value(feed.command(name, arguments)?)
                .map_err(|_| "EV3 snapshot unavailable".to_owned()),
            _ => Err("EV3 input target mismatch".into()),
        }
    }

    #[cfg(test)]
    fn has_endpoint(&self) -> bool {
        self.session.lock().unwrap().is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Own ABI proof: correlate the complete reply and retain signed errno.
    fn assert_program_reply(snapshot: &Value, request: &Value, expected_result: i32) -> (u8, u16) {
        let bytes: Vec<u8> = snapshot["lifecycle"]["nuttxProgramReply"]
            .as_array().unwrap().iter().map(|v| u8::try_from(v.as_u64().unwrap()).unwrap()).collect();
        let packet: Vec<u8> = request.as_array().unwrap().iter()
            .map(|v| u8::try_from(v.as_u64().unwrap()).unwrap()).collect();
        assert_eq!(bytes.len(), 20);
        assert_eq!(&bytes[..3], &[0x71, 1, packet[2]]);
        assert_eq!(&bytes[4..8], &packet[4..8]);
        assert_eq!(i32::from_le_bytes(bytes[8..12].try_into().unwrap()), expected_result);
        (bytes[3], u16::from_le_bytes(bytes[14..16].try_into().unwrap()))
    }

    #[test]
    fn close_is_idempotent_and_does_not_manufacture_a_session() {
        let debugger = RenodeDebugger::new();
        let supervisor = RenodeSupervisor::new();
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
        assert!(!debugger.has_endpoint());
    }

    #[test]
    #[ignore = "requires the pinned simulation-only ARM arena guest"]
    fn packaged_arena_guest_observes_motion_and_accepts_bounded_inputs() {
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        debugger.start(&supervisor).unwrap();
        let first = debugger.state().unwrap();
        assert_eq!(first["target"]["firmware"], "brickwright-arena-demo");
        debugger.run().unwrap();
        thread::sleep(Duration::from_millis(200));
        debugger.pause().unwrap();
        let moved = debugger.state().unwrap();
        assert!(
            moved["motors"][1]["position"].as_f64().unwrap()
                > first["motors"][1]["position"].as_f64().unwrap()
        );
        debugger.spike_arena_inputs(json!({"sensors":[{"port":"D","kind":"distance","values":{"distanceMillimeters":100}}],"loads":[]})).unwrap();
        debugger.run().unwrap();
        thread::sleep(Duration::from_millis(200));
        debugger.pause().unwrap();
        let stopped = debugger.state().unwrap();
        assert_eq!(stopped["motors"][1]["speedDps"], 0);
        debugger.close(&supervisor).unwrap();
    }

    #[test]
    #[ignore = "requires both build-pinned firmware packages and private synthetic caller fixtures"]
    fn packaged_spike_backends_run_native_and_python_callers() {
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        debugger
            .start_spike_backend(&supervisor, Some("guest"))
            .unwrap();
        assert_eq!(
            debugger.state().unwrap()["target"]["firmware"],
            "brickwright-arena-demo"
        );
        debugger.close(&supervisor).unwrap();
        debugger
            .start_spike_backend(&supervisor, Some("nuttx"))
            .unwrap();
        let first = debugger.state().unwrap();
        assert_eq!(first["target"]["firmware"], "brickwright-nuttx");
        assert!(first["target"]["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c == "nuttx-program/v1"));
        debugger.run().unwrap();

        let cases: serde_json::Value = serde_json::from_slice(
            &std::fs::read(
                std::env::var("BW_NUTTX_CALLER_FIXTURES")
                    .expect("generate private synthetic caller fixtures first"),
            )
            .unwrap(),
        )
        .unwrap();
        let mut response = serde_json::Value::Null;
        for case in cases.as_array().unwrap() {
            for packet in case["packets"].as_array().unwrap() {
                response = debugger
                    .spike_program_packet(serde_json::json!({"bytes":packet}))
                    .unwrap();
                for byte in response["lifecycle"]["nuttxProgramReply"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .skip(8)
                    .take(4)
                {
                    assert_eq!(byte, 0);
                }
            }
            for _ in 0..50 {
                response = debugger
                    .spike_program_packet(serde_json::json!({"bytes":case["status"]}))
                    .unwrap();
                let state = response["lifecycle"]["nuttxProgramReply"][3]
                    .as_u64()
                    .unwrap();
                assert_ne!(state, 5, "{}", response);
                if state == 3 {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            assert_eq!(response["lifecycle"]["nuttxProgramReply"][3], 3);
            if case["python"] == true {
                assert!(response["lifecycle"]["nuttxProgramOutput"]["text"]
                    .as_str()
                    .unwrap()
                    .contains("hello from ARM"));
            } else {
                assert!(response["motors"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|m| m["port"] == "B" && m["position"].as_f64().unwrap() > 1.0));
            }
        }
        debugger.spike_arena_inputs(serde_json::json!({"sensors":[{"port":"E","kind":"force","values":{"forcePercent":70,"pressed":true}}],"loads":[]})).unwrap();
        debugger.close(&supervisor).unwrap();
    }

    #[test]
    #[ignore = "requires the build-pinned six-motor NuttX package and private caller fixture"]
    fn packaged_spike_nuttx_six_motor_profile_runs_stops_and_survives_reset() {
        let elapsed = Instant::now();
        let supervisor = RenodeSupervisor::new();let debugger = RenodeDebugger::new();
        let check_profile = |snapshot: &Value| {
            assert_eq!(snapshot["target"]["firmware"], "brickwright-nuttx");
            assert!(snapshot["target"]["capabilities"].as_array().unwrap().iter().any(|cap| cap == "nuttx-six-motors/v1"));
            let motors = snapshot["motors"].as_array().unwrap();assert_eq!(motors.len(),6);
            for port in ["A","B","C","D","E","F"] {
                assert_eq!(motors.iter().filter(|motor| motor["port"] == port).count(),1);
                assert_eq!(snapshot["ports"].as_array().unwrap().iter().filter(|p| p["id"] == port
                    && p["attached"] == true && p["kind"] == "motor").count(),1);
            }
        };
        eprintln!("six-profile stage=boot elapsed_ms=0");
        debugger.start_spike_profile(&supervisor,Some("nuttx"),SpikeTopology::SixMotors).unwrap();
        let first = debugger.state().unwrap();check_profile(&first);
        assert_eq!(first["lifecycle"]["nuttxProgram"]["state"],0);
        let positions = |snapshot: &Value| -> Vec<f64> {
            ["A","B","C","D","E","F"].into_iter().map(|port| snapshot["motors"].as_array().unwrap().iter()
                .find(|m| m["port"] == port).unwrap()["position"].as_f64().unwrap()).collect()
        };
        let initial_positions = positions(&first);
        let cases: Value = serde_json::from_slice(&std::fs::read(std::env::var("BW_NUTTX_CALLER_FIXTURES")
            .expect("generate private synthetic caller fixtures first")).unwrap()).unwrap();
        let native = cases.as_array().unwrap().iter().find(|case| case["python"] == false).unwrap();
        let fixture = &native["sixMotorProfile"];
        assert!(fixture["source"].as_str().unwrap().len() <= 4095);
        debugger.run().unwrap();
        let send = |stage: &str, request: &Value| {
            let began = Instant::now();
            let response = debugger.spike_program_packet(json!({"bytes":request})).unwrap_or_else(|error| {
                panic!("six-profile stage={stage} op={} packet_ms={} elapsed_ms={} endpoint_owned={} error={error}",
                    request[2],began.elapsed().as_millis(),elapsed.elapsed().as_millis(),debugger.has_endpoint())
            });
            assert_program_reply(&response,request,0);response
        };
        let mut response = first;
        for packet in fixture["packets"].as_array().unwrap() {response=send("upload-python-six",packet);}
        assert_eq!(response["lifecycle"]["nuttxProgramReply"][3],2);
        let movement_deadline = Instant::now() + Duration::from_secs(12);
        loop {
            response = debugger.state().unwrap();check_profile(&response);
            assert_eq!(response["lifecycle"]["nuttxProgram"]["state"],2,"six-motor Python unexpectedly completed or faulted");
            let current = positions(&response);
            if (2..6).all(|port| current[port] > initial_positions[port] + 1.0) {break;}
            assert!(Instant::now() < movement_deadline,"C-F did not move under six-profile Python");
            thread::sleep(Duration::from_millis(50));
        }
        response = send("stop-six",&fixture["stop"]);
        assert_eq!(response["lifecycle"]["nuttxProgramReply"][3],4);
        let stop_deadline = Instant::now() + Duration::from_secs(8);
        loop {
            response=debugger.state().unwrap();check_profile(&response);
            if response["motors"].as_array().unwrap().iter().all(|m| m["speedDps"].as_f64() == Some(0.0)
                && m["demandDirection"].as_i64() == Some(0)) {break;}
            assert!(Instant::now() < stop_deadline,"STOP did not idle all six motors");
            thread::sleep(Duration::from_millis(50));
        }
        eprintln!("six-profile stage=reset elapsed_ms={}",elapsed.elapsed().as_millis());
        debugger.reset(&supervisor).unwrap();
        let reset = debugger.state().unwrap();check_profile(&reset);
        assert_eq!(reset["target"],response["target"]);
        assert_eq!(reset["lifecycle"]["nuttxProgram"]["state"],0,"reset must not upload or autoexecute");
        assert!(reset["motors"].as_array().unwrap().iter().all(|m| m["speedDps"].as_f64() == Some(0.0)
            && m["demandDirection"].as_i64() == Some(0)));
        assert!(debugger.has_endpoint());
        debugger.close(&supervisor).unwrap();assert!(!debugger.has_endpoint());
        eprintln!("six-profile stage=complete elapsed_ms={}",elapsed.elapsed().as_millis());
    }

    #[test]
    #[ignore = "requires the build-pinned six-motor NuttX package and private compiled Scratch fixtures"]
    fn packaged_spike_nuttx_compiled_six_motor_programs_move_position_and_brake() {
        let elapsed=Instant::now();let supervisor=RenodeSupervisor::new();let debugger=RenodeDebugger::new();
        let cases:Value=serde_json::from_slice(&std::fs::read(std::env::var("BW_NUTTX_CALLER_FIXTURES")
            .expect("generate private synthetic caller fixtures first")).unwrap()).unwrap();
        let native=cases.as_array().unwrap().iter().find(|case|case["python"]==false).unwrap();
        let fixtures=&native["compiledSix"];
        // Optional qualification receipt, supplied explicitly by a local tester.
        // The ignored test never writes a default or bundled output location.
        let receipt=std::env::var_os("BW_NUTTX_PRIVATE_FRAME_RECEIPT").map(|path|
            std::cell::RefCell::new(std::fs::OpenOptions::new().write(true).create_new(true).open(path)
                .expect("new private frame receipt")));
        let check=|frame:&Value| {
            assert_eq!(frame["target"]["firmware"],"brickwright-nuttx");
            assert!(frame["target"]["capabilities"].as_array().unwrap().iter().any(|c|c=="nuttx-six-motors/v1"));
            assert_eq!(frame["motors"].as_array().unwrap().len(),6);
            for port in ["A","B","C","D","E","F"] {
                assert_eq!(frame["motors"].as_array().unwrap().iter().filter(|m|m["port"]==port).count(),1);
                assert_eq!(frame["ports"].as_array().unwrap().iter().filter(|p|p["id"]==port && p["attached"]==true && p["kind"]=="motor").count(),1);
            }
            if let Some(file)=&receipt {
                use std::io::Write;
                let mut file=file.borrow_mut();
                serde_json::to_writer(&mut *file,frame).unwrap();file.write_all(b"\n").unwrap();
            }
        };
        let idle=|frame:&Value|frame["motors"].as_array().unwrap().iter().all(|m|
            m["speedDps"].as_f64()==Some(0.0) && m["demandDirection"].as_i64()==Some(0));
        let positions=|frame:&Value|->Vec<f64> {
            ["A","B","C","D","E","F"].into_iter().map(|port|frame["motors"].as_array().unwrap().iter()
                .find(|m|m["port"]==port).unwrap()["position"].as_f64().unwrap()).collect()
        };
        let send=|stage:&str,request:&Value| {
            let response=debugger.spike_program_packet(json!({"bytes":request})).unwrap_or_else(|error|
                panic!("compiled-six stage={stage} op={} elapsed_ms={} endpoint_owned={} error={error}",
                    request[2],elapsed.elapsed().as_millis(),debugger.has_endpoint()));
            assert_program_reply(&response,request,0);check(&response);response
        };
        let wait=|stage:&str,state:u64,process_started:Instant,position_clock:Option<u64>| {
            let deadline=process_started+Duration::from_secs(110);
            let mut last_position_clock=position_clock;
            loop {
                let frame=debugger.state().unwrap();check(&frame);
                let actual=frame["lifecycle"]["nuttxProgram"]["state"].as_u64().unwrap();
                assert_ne!(actual,5,"compiled-six stage={stage} faulted: {}",frame["lifecycle"]["nuttxProgram"]);
                if let Some(start_clock)=position_clock {
                    let clock=frame["lifecycle"]["nuttxProgram"]["clockMs"].as_u64().expect("integer firmware program clock");
                    assert!(clock<=u64::from(u32::MAX),"firmware program clock exceeds uint32");
                    assert!(clock>=last_position_clock.unwrap(),"firmware program clock must not regress");
                    last_position_clock=Some(clock);
                    let delta=clock.checked_sub(start_clock).expect("firmware program clock must not regress");
                    assert!(delta<=2000,"relative F position exceeded two simulated seconds: delta_ms={delta} program={} motors={}",
                        frame["lifecycle"]["nuttxProgram"],frame["motors"]);
                }
                if actual==state && idle(&frame) {break frame;}
                assert!(Instant::now()<deadline,
                    "compiled-six stage={stage} completion/idle timed out elapsed_ms={} clock_ns={} program={} motors={}",
                    elapsed.elapsed().as_millis(),frame["clockNs"],frame["lifecycle"]["nuttxProgram"],frame["motors"]);
                thread::sleep(Duration::from_millis(50));
            }
        };
        // Wall-time pacing does not bound firmware-clock completion. Qualify the
        // prior 30-degree contract in its own fresh process;
        // retain production 120-second lifetime and enforce a 110-second test budget.
        for group in [vec!["continuous","timed"],vec!["position"]] {
            let process_started=Instant::now();
            assert!(elapsed.elapsed()<Duration::from_secs(300));
            debugger.start_spike_profile(&supervisor,Some("nuttx"),SpikeTopology::SixMotors).unwrap();
            let first=debugger.state().unwrap();check(&first);assert!(idle(&first));
            assert_eq!(first["lifecycle"]["nuttxProgram"]["state"],0);
            debugger.run().unwrap();
            for name in group {
                let fixture=&fixtures[name];assert!(fixture["source"].as_str().unwrap().contains("WHEN flag clicked"));
                assert!(fixture["program"]["instructions"].as_array().unwrap().len()<=256);
                let before=positions(&debugger.state().unwrap());
                let mut ready=Value::Null;
                for packet in fixture["upload"].as_array().unwrap() {ready=send("upload-compiled-six",packet);}
                assert_eq!(ready["lifecycle"]["nuttxProgramReply"][3],1,"COMMIT must leave READY without execution");
                let paused=debugger.state().unwrap();assert!(idle(&paused));
                assert!(positions(&paused).iter().zip(&before).all(|(a,b)|(a-b).abs()<=0.1),"upload must not move motors");
                eprintln!("compiled-six stage={name} before_positions_deg={before:?} elapsed_ms={}",elapsed.elapsed().as_millis());
                let started=send("start-compiled-six",&fixture["start"]);
                eprintln!("compiled-six stage={name}-START clock_ns={} program={} motors={}",
                    started["clockNs"],started["lifecycle"]["nuttxProgram"],started["motors"]);
                if name=="continuous" {
                    let deadline=Instant::now()+Duration::from_secs(12);
                    loop {
                        let frame=debugger.state().unwrap();check(&frame);
                        assert_eq!(frame["lifecycle"]["nuttxProgram"]["state"],2);
                        if positions(&frame).iter().enumerate().all(|(p,v)|*v>before[p]+1.0) {break;}
                        assert!(Instant::now()<deadline,"compiled C-F motors did not move");thread::sleep(Duration::from_millis(50));
                    }
                    send("stop-compiled-six",&fixture["stop"]);
                    let stopped=wait("STOP-all-six",4,process_started,None);
                    eprintln!("compiled-six stage=STOP-all-six after_positions_deg={:?} all_idle={} elapsed_ms={}",
                        positions(&stopped),idle(&stopped),elapsed.elapsed().as_millis());
                } else {
                    let position_clock=if name=="position" {
                        Some(started["lifecycle"]["nuttxProgram"]["clockMs"].as_u64().expect("integer firmware program clock"))
                    } else {None};
                    let completed=wait("END-all-owned",3,process_started,position_clock);let after=positions(&completed);
                    eprintln!("compiled-six stage={name}-END after_positions_deg={after:?} all_idle={} elapsed_ms={}",
                        idle(&completed),elapsed.elapsed().as_millis());
                    if name=="position" {
                        eprintln!("compiled-six stage=relative-F target_delta_deg=30 actual_delta_deg={} error_deg={} tolerance_deg=3 within_tolerance={}",
                            after[5]-before[5],after[5]-before[5]-30.0,(after[5]-before[5]-30.0).abs()<=3.0);
                        assert!((after[5]-before[5]-30.0).abs()<=3.0,"relative F target exceeds ±3 degrees");
                        assert!((0..5).all(|p|(after[p]-before[p]).abs()<=3.0),"single-position move changed other ports");
                    } else {assert!((2..6).all(|p|after[p]>before[p]+1.0),"timed native C-F did not move");}
                }
            }
            debugger.close(&supervisor).unwrap();assert!(!debugger.has_endpoint());
            assert!(process_started.elapsed()<Duration::from_secs(110));
        }
        eprintln!("compiled-six stage=complete elapsed_ms={}",elapsed.elapsed().as_millis());
    }

    #[test]
    #[ignore = "requires the build-pinned storage-capable NuttX package and private native caller fixture"]
    fn packaged_spike_nuttx_program_storage_retains_session_without_autorun() {
        // One fresh firmware boot keeps storage diagnosis independent of the paired
        // guest/Python proof and within the existing supervisor session bound.
        let elapsed = Instant::now();
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        eprintln!("storage stage=boot-full-nuttx elapsed_ms=0");
        debugger.start_spike_backend(&supervisor, Some("nuttx")).unwrap_or_else(|error| {
            panic!("storage stage=boot-full-nuttx elapsed_ms={} error={error}", elapsed.elapsed().as_millis())
        });
        eprintln!("storage stage=read-first-snapshot elapsed_ms={}", elapsed.elapsed().as_millis());
        let first = debugger.state().unwrap_or_else(|error| {
            panic!("storage stage=read-first-snapshot elapsed_ms={} error={error}", elapsed.elapsed().as_millis())
        });
        assert_eq!(first["target"]["firmware"], "brickwright-nuttx");
        for port in ["A", "B", "C", "D", "E", "F"] {
            assert!(first["ports"].as_array().unwrap().iter().any(|entry| entry["id"] == port),
                "packaged shared state omitted port {port}");
        }
        eprintln!("storage stage=run-emulator elapsed_ms={}", elapsed.elapsed().as_millis());
        debugger.run().unwrap_or_else(|error| {
            panic!("storage stage=run-emulator elapsed_ms={} error={error}", elapsed.elapsed().as_millis())
        });
        let cases: Value = serde_json::from_slice(&std::fs::read(
            std::env::var("BW_NUTTX_CALLER_FIXTURES").expect("generate private synthetic caller fixtures first")
        ).unwrap()).unwrap();
        let mut response;
        assert!(first["target"]["capabilities"].as_array().unwrap().iter()
            .any(|cap| cap == "nuttx-program-storage/v1"), "stage a storage-capable own firmware package");
        let native = cases.as_array().unwrap().iter().find(|case| case["python"] == false).unwrap();
        let storage = &native["storage"];
        let last_storage_sequence = std::cell::Cell::new(
            first["lifecycle"]["nuttxProgramStorage"]["requestSeq"].as_u64());
        let send = |stage: &str, request: &Value| {
            let packet = request.as_array().unwrap();
            let op = packet[2].as_u64().unwrap();
            let id = u32::from_le_bytes(std::array::from_fn(|i| packet[4+i].as_u64().unwrap() as u8));
            let began = Instant::now();
            eprintln!("storage stage={stage} op={op} id={id} elapsed_ms={}", elapsed.elapsed().as_millis());
            let mut response = if matches!(op, 8 | 9) {
                assert!(first["target"]["capabilities"].as_array().unwrap().iter()
                    .any(|cap| cap == "nuttx-program-storage-deferred/v1"), "stage the deferred-storage server package");
                debugger.spike_program_storage_submit(json!({"bytes": request}))
            } else {
                debugger.spike_program_packet(json!({"bytes": request}))
            }.unwrap_or_else(|error| {
                panic!("storage stage={stage} op={op} id={id} elapsed_ms={} packet_ms={} endpoint_owned={} error={error}",
                    elapsed.elapsed().as_millis(), began.elapsed().as_millis(), debugger.has_endpoint())
            });
            if matches!(op, 8 | 9) {
                let submitted = response["lifecycle"]["nuttxProgramStorage"]["requestSeq"].as_u64().unwrap();
                assert_ne!(Some(submitted), last_storage_sequence.get(),
                    "storage stage={stage} reused a previous storage request sequence");
                loop {
                    assert!(began.elapsed() < Duration::from_secs(30), "storage stage={stage} completion timed out");
                    assert!(debugger.has_endpoint(), "storage endpoint lost at {stage}");
                    assert_eq!(response["target"], first["target"], "storage target changed at {stage}");
                    for key in ["generation", "connectionGeneration"] {
                        assert_eq!(response["lifecycle"][key], first["lifecycle"][key], "storage generation changed at {stage}");
                    }
                    let metadata = &response["lifecycle"]["nuttxProgramStorage"];
                    assert_eq!(metadata["requestSeq"].as_u64(), Some(submitted));
                    assert_eq!(metadata["operation"].as_u64(), Some(op));
                    assert_eq!(metadata["programId"].as_u64(), Some(id as u64));
                    if metadata["pending"] == false {
                        assert_eq!(metadata["replySeq"].as_u64(), Some(submitted));
                        last_storage_sequence.set(Some(submitted));
                        break;
                    }
                    assert!(began.elapsed() < Duration::from_millis(27950), "storage stage={stage} op={op} id={id} completion timed out");
                    thread::sleep(Duration::from_millis(50));
                    response = debugger.state().unwrap_or_else(|error| {
                        panic!("storage stage={stage} op={op} id={id} poll_ms={} endpoint_owned={} error={error}",
                            began.elapsed().as_millis(), debugger.has_endpoint())
                    });
                }
            }
            let reply = response["lifecycle"]["nuttxProgramReply"].as_array().unwrap();
            let result = i32::from_le_bytes(std::array::from_fn(|i| reply[8+i].as_u64().unwrap() as u8));
            eprintln!("storage stage={stage} complete state={} result={result} packet_ms={} elapsed_ms={}",
                reply[3], began.elapsed().as_millis(), elapsed.elapsed().as_millis());
            response
        };
        // Upload without START, persist, then replace the resident program under the same ID.
        for request in storage["upload"].as_array().unwrap() {
            response = send("upload-native", request);assert_program_reply(&response, request, 0);
        }
        response = send("save-native", &storage["save"]);
        assert_eq!(assert_program_reply(&response, &storage["save"], 0).0, 1);
        let retained_identity = response["target"].clone();
        let retained_seq = response["seq"].as_u64().unwrap();
        for request in storage["replace"].as_array().unwrap() {
            response = send("replace-resident", request);assert_program_reply(&response, request, 0);
        }
        assert_eq!(assert_program_reply(&response, storage["replace"].as_array().unwrap().last().unwrap(), 0),
            (1, u16::try_from(storage["replacementCount"].as_u64().unwrap()).unwrap()));
        assert_ne!(storage["savedCount"], storage["replacementCount"]);
        response = send("load-saved-native", &storage["load"]);
        assert_eq!(assert_program_reply(&response, &storage["load"], 0),
            (1, u16::try_from(storage["savedCount"].as_u64().unwrap()).unwrap()));
        let motor_b_position = |snapshot: &Value| snapshot["motors"].as_array().unwrap().iter()
            .find(|motor| motor["port"] == "B").unwrap()["position"].as_f64().unwrap();
        let loaded_position = motor_b_position(&response);
        thread::sleep(Duration::from_millis(100));
        response = send("status-no-autorun", &native["status"]);
        assert_eq!(assert_program_reply(&response, &native["status"], 0).0, 1, "LOAD must not autorun");
        assert!((motor_b_position(&response) - loaded_position).abs() < 0.1, "LOAD moved the motor");
        response = send("start-restored", &storage["start"]);
        assert_eq!(assert_program_reply(&response, &storage["start"], 0).0, 2);
        for _ in 0..50 {
            response = send("status-restored-run", &native["status"]);
            let state = assert_program_reply(&response, &native["status"], 0).0;
            assert_ne!(state, 5, "restored native program faulted during status-restored-run");
            if state == 3 { break; }
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(response["lifecycle"]["nuttxProgramReply"][3], 3);
        assert!(motor_b_position(&response) > loaded_position + 1.0, "saved motor program was not restored");
        // START accepts READY only. Restore the saved slot before the second run.
        response = send("reload-before-stop-run", &storage["load"]);
        assert_eq!(assert_program_reply(&response, &storage["load"], 0).0, 1);
        let reloaded_position = motor_b_position(&response);
        response = send("status-reloaded-no-autorun", &native["status"]);
        assert_eq!(assert_program_reply(&response, &native["status"], 0).0, 1);
        assert!((motor_b_position(&response) - reloaded_position).abs() < 0.1, "second LOAD moved the motor");
        response = send("restart-before-stop", &storage["start"]);
        assert_eq!(assert_program_reply(&response, &storage["start"], 0).0, 2);
        response = send("stop-retained", &storage["stop"]);
        assert_eq!(assert_program_reply(&response, &storage["stop"], 0).0, 4);
        // STOP retains both process and saved slot. Allow a bounded unwind before LOAD.
        for _ in 0..50 {
            response = send("load-after-stop", &storage["load"]);
            let bytes = response["lifecycle"]["nuttxProgramReply"].as_array().unwrap();
            let result = i32::from_le_bytes(std::array::from_fn(|i| bytes[8+i].as_u64().unwrap() as u8));
            if result == 0 { break; }
            assert_eq!(result, -16, "unexpected LOAD failure after STOP");
            thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(assert_program_reply(&response, &storage["load"], 0).0, 1);
        assert_eq!(response["target"], retained_identity);
        assert!(response["seq"].as_u64().unwrap() > retained_seq);
        assert!(debugger.has_endpoint(), "storage must retain the live desktop session");
        eprintln!("storage stage=close-session elapsed_ms={}", elapsed.elapsed().as_millis());
        debugger.close(&supervisor).unwrap();
        eprintln!("storage stage=complete elapsed_ms={}", elapsed.elapsed().as_millis());
    }

    // SPDX-License-Identifier: BSD-3-Clause
    // Copyright (c) 2026 Brickwright contributors
    #[test]
    #[ignore = "requires privately staged own NuttX package, caller fixtures and an empty host flash directory"]
    fn packaged_spike_nuttx_flash_survives_close_and_profile_change_without_autorun() {
        let elapsed = Instant::now();
        let root = std::path::PathBuf::from(std::env::var("BW_NUTTX_TEST_FLASH_ROOT")
            .expect("provide an empty private host flash directory"));
        let reopen_only = std::env::var("BW_NUTTX_TEST_REOPEN_ONLY").as_deref() == Ok("1");
        assert!(if reopen_only { root.is_dir() } else { !root.exists() },
            "provide a fresh store for full qualification or an existing private store for explicit reopen diagnosis");
        let cases: Value = serde_json::from_slice(&std::fs::read(std::env::var("BW_NUTTX_CALLER_FIXTURES")
            .expect("generate private caller fixtures first")).unwrap()).unwrap();
        let native = cases.as_array().unwrap().iter().find(|case| case["python"] == false).unwrap();
        let storage = &native["storage"];
        for (leg, topology) in [(0, SpikeTopology::SixMotors), (1, SpikeTopology::Default)] {
            if reopen_only && leg == 0 { continue; }
            let supervisor = RenodeSupervisor::new();
            supervisor.set_flash_store_root(root.clone()).unwrap();
            let debugger = RenodeDebugger::new();
            eprintln!("persistent-flash leg={leg} stage=boot elapsed_ms={}", elapsed.elapsed().as_millis());
            debugger.start_spike_profile(&supervisor, Some("nuttx"), topology).unwrap();
            let first = debugger.state().unwrap();
            assert!(first["target"]["capabilities"].as_array().unwrap().iter()
                .any(|cap| cap == "nuttx-flash-checkpoint/v1"));
            debugger.run().unwrap();
            let send = |request: &Value| {
                let op = request[2].as_u64().unwrap();
                let began = Instant::now();
                let mut frame = if matches!(op, 8 | 9) {
                    debugger.spike_program_storage_submit(json!({"bytes": request}))
                } else { debugger.spike_program_packet(json!({"bytes": request})) }.unwrap();
                if matches!(op, 8 | 9) {
                    let seq = frame["lifecycle"]["nuttxProgramStorage"]["requestSeq"].clone();
                    loop {
                        assert!(began.elapsed() < Duration::from_secs(28), "host storage job timed out");
                        let metadata = &frame["lifecycle"]["nuttxProgramStorage"];
                        assert_eq!(metadata["requestSeq"], seq);
                        if metadata["pending"] == false {
                            assert_program_reply(&frame, request, 0);
                            if op == 9 { break; }
                            let checkpoint = &frame["lifecycle"]["nuttxFlashCheckpoint"];
                            assert_eq!(checkpoint["requestSeq"], seq);
                            assert_eq!(checkpoint["programId"], metadata["programId"]);
                            assert_ne!(checkpoint["status"], "failed", "host commit failed: {checkpoint}");
                            if checkpoint["status"] == "durable" { break; }
                        }
                        thread::sleep(Duration::from_millis(50));
                        frame = debugger.state().unwrap();
                    }
                    eprintln!("persistent-flash leg={leg} op={op} job_ms={}", began.elapsed().as_millis());
                }
                frame
            };
            let status = send(&native["status"]);
            assert_eq!(assert_program_reply(&status, &native["status"], 0).0, 0, "fresh boot must be EMPTY");
            let position = |frame: &Value| frame["motors"].as_array().unwrap().iter()
                .find(|motor| motor["port"] == "B").unwrap()["position"].as_f64().unwrap();
            let before = position(&status);
            thread::sleep(Duration::from_millis(150));
            assert!((position(&debugger.state().unwrap()) - before).abs() < 0.1, "boot must not autorun");
            if leg == 0 {
                for request in storage["upload"].as_array().unwrap() {
                    assert_program_reply(&send(request), request, 0);
                }
                assert_eq!(assert_program_reply(&send(&storage["save"]), &storage["save"], 0).0, 1);
            } else {
                let loaded = send(&storage["load"]);
                assert_eq!(assert_program_reply(&loaded, &storage["load"], 0),
                    (1, u16::try_from(storage["savedCount"].as_u64().unwrap()).unwrap()));
                let before_run = position(&loaded);
                thread::sleep(Duration::from_millis(150));
                let ready = send(&native["status"]);
                assert_eq!(assert_program_reply(&ready, &native["status"], 0).0, 1);
                assert!((position(&ready) - before_run).abs() < 0.1, "LOAD must not autorun");
                assert_eq!(assert_program_reply(&send(&storage["start"]), &storage["start"], 0).0, 2);
                let began = Instant::now();
                loop {
                    let running = send(&native["status"]);
                    let state = assert_program_reply(&running, &native["status"], 0).0;
                    assert_ne!(state, 5, "restored program faulted");
                    if state == 3 {
                        assert!(position(&running) > before_run + 1.0, "restored flash program did not move motor B");
                        break;
                    }
                    assert!(began.elapsed() < Duration::from_secs(25), "restored native program did not finish");
                    thread::sleep(Duration::from_millis(50));
                }
                assert_program_reply(&send(&storage["stop"]), &storage["stop"], 0);
            }
            debugger.close(&supervisor).unwrap();
            assert!(!debugger.has_endpoint());
        }
        eprintln!("persistent-flash complete elapsed_ms={}", elapsed.elapsed().as_millis());
    }

    /// Hosted/manual proof against the exact build-pinned Renode tree. The ordinary library
    /// suite cannot carry a 1+ GB emulator build, so the dedicated workflow supplies every
    /// compile-time pin and explicitly selects this test.
    #[test]
    #[ignore = "requires the build-pinned Renode SPIKE package"]
    fn packaged_spike_session_drives_the_complete_cpu_and_state_contract() {
        assert!(option_env!("BW_RENODE_EXECUTABLE").is_some());
        assert!(option_env!("BW_RENODE_SPIKE_FIRMWARE").is_some());
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        assert_eq!(debugger.start(&supervisor).unwrap(), "ready");

        let registers = debugger.registers().unwrap();
        let pc = u32::try_from(registers["pc"].as_u64().unwrap()).unwrap();
        assert_ne!(pc, 0);
        assert_eq!(debugger.read_memory(pc & !1, 4).unwrap().len(), 8);
        assert_eq!(debugger.set_breakpoint(pc & !1).unwrap(), "set");
        assert_eq!(debugger.clear_breakpoint(pc & !1).unwrap(), "cleared");
        assert_eq!(debugger.step().unwrap(), "stopped");
        assert_eq!(debugger.run().unwrap(), "running");
        thread::sleep(Duration::from_millis(25));
        assert_eq!(debugger.pause().unwrap(), "paused");

        let state = debugger.state().unwrap();
        assert_eq!(state["schemaVersion"], 1);
        assert_eq!(state["type"], "snapshot");
        assert_eq!(state["target"]["board"], "spike-prime");
        assert_eq!(debugger.reset(&supervisor).unwrap(), "reset");
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
    }

    #[test]
    #[ignore = "requires the build-pinned Renode EV3 package"]
    fn packaged_ev3_session_drives_the_complete_cpu_and_evidence_contract() {
        assert!(option_env!("BW_RENODE_EXECUTABLE").is_some());
        assert!(option_env!("BW_RENODE_EV3_FIRMWARE").is_some());
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        assert_eq!(debugger.start_ev3(&supervisor).unwrap(), "ready");

        let registers = debugger.registers().unwrap();
        let pc = u32::try_from(registers["pc"].as_u64().unwrap()).unwrap();
        assert_eq!(pc, 0xffff_0000);
        assert!(registers["cpsr"].is_u64());
        assert_eq!(debugger.read_memory(pc, 4).unwrap().len(), 8);
        assert_eq!(debugger.set_breakpoint(pc & !3).unwrap(), "set");
        assert_eq!(debugger.clear_breakpoint(pc & !3).unwrap(), "cleared");
        assert_eq!(debugger.step().unwrap(), "stopped");
        assert_eq!(debugger.run().unwrap(), "running");
        let state = debugger.state().unwrap();
        assert_eq!(debugger.pause().unwrap(), "paused");
        assert_eq!(state["schemaVersion"], 1);
        assert_eq!(state["type"], "snapshot");
        assert_eq!(state["target"]["board"], "ev3");
        assert_eq!(state["target"]["architecture"], "arm926ej-s");
        assert_eq!(state["evidence"]["uart"], "EV3 ARM9 IRQ\n");
        assert_eq!(state["evidence"]["aintcIrq"], true);
        assert_eq!(state["display"]["width"], 178);
        assert_eq!(state["display"]["height"], 128);
        assert_eq!(
            state["display"]["pixels"].as_array().unwrap().len(),
            178 * 128
        );
        assert_eq!(
            state["sensors"][0]["values"]["channels"]
                .as_array()
                .unwrap()
                .len(),
            16
        );
        let motors = state["motors"].as_array().unwrap();
        assert_eq!(motors.len(), 4);
        for port in ["A", "B", "C", "D"] {
            assert!(motors.iter().any(|motor| motor["port"] == port));
        }
        let pressed = debugger
            .ev3_input("ev3.button.set", json!({"button":"center","pressed":true}))
            .unwrap();
        assert_eq!(pressed["buttons"]["center"], true);
        let released = debugger
            .ev3_input("ev3.button.set", json!({"button":"center","pressed":false}))
            .unwrap();
        assert_eq!(released["buttons"]["center"], false);
        let analog = debugger
            .ev3_input("ev3.analog.set-channel", json!({"channel":3,"value":777}))
            .unwrap();
        assert_eq!(analog["sensors"][0]["values"]["channels"][3], 777);
        assert!(debugger
            .ev3_input("ev3.analog.set-channel", json!({"channel":16,"value":0}))
            .is_err());
        assert_eq!(debugger.reset(&supervisor).unwrap(), "reset");
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
    }

    #[test]
    #[ignore = "requires the build-pinned source-built EV3 motor guest"]
    fn packaged_ev3_motor_guest_drives_observed_motion_and_inputs() {
        assert!(option_env!("BW_RENODE_EV3_FIRMWARE").is_some());
        let supervisor = RenodeSupervisor::new();
        let debugger = RenodeDebugger::new();
        assert_eq!(debugger.start_ev3(&supervisor).unwrap(), "ready");
        assert_eq!(debugger.run().unwrap(), "running");
        let deadline = Instant::now() + Duration::from_secs(5);
        let state = loop {
            let state = debugger.state().unwrap();
            let motors = state["motors"].as_array().unwrap();
            if motors.len() == 4
                && motors.iter().all(|motor| {
                    motor["emittedEdges"]
                        .as_u64()
                        .is_some_and(|edges| edges > 0)
                })
            {
                break state;
            }
            assert!(
                Instant::now() < deadline,
                "guest did not produce all four motor edges: {state}"
            );
            thread::sleep(Duration::from_millis(20));
        };
        assert_eq!(debugger.pause().unwrap(), "paused");
        for port in ["A", "B", "C", "D"] {
            let motor = state["motors"]
                .as_array()
                .unwrap()
                .iter()
                .find(|motor| motor["port"] == port)
                .unwrap();
            assert_eq!(motor["state"], "Forward");
            assert_eq!(motor["direction"], 1);
            assert_eq!(motor["dutyCycle"], 0.5);
            assert!(motor["tachometerCount"].as_i64().unwrap() > 0);
        }
        let pressed = debugger
            .ev3_input("ev3.button.set", json!({"button":"center","pressed":true}))
            .unwrap();
        assert_eq!(pressed["buttons"]["center"], true);
        let analog = debugger
            .ev3_input("ev3.analog.set-channel", json!({"channel":3,"value":777}))
            .unwrap();
        assert_eq!(analog["sensors"][0]["values"]["channels"][3], 777);
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
    }
}
