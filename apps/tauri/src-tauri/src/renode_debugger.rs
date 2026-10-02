//! Semantic owner for optional architecture-aware Renode sessions.
//!
//! It returns status words only. Ports, tokens, paths and process handles stay
//! in native state and cannot cross into either webview.

use crate::renode_brick_state::BrickStateFeed;
use crate::renode_rsp::{Arm32Architecture, RenodeRsp, RenodeRspInterrupt};
use crate::renode_supervisor::{RenodeSupervisor, TeardownReason};
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
        self.start_target(supervisor, RenodeTarget::SpikePrime, None)
    }

    pub(crate) fn start_spike_backend(
        &self,
        supervisor: &RenodeSupervisor,
        backend: Option<&str>,
    ) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::SpikePrime, backend)
    }

    pub(crate) fn start_ev3(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::Ev3, None)
    }

    fn start_target(
        &self,
        supervisor: &RenodeSupervisor,
        target: RenodeTarget,
        backend: Option<&str>,
    ) -> Result<&'static str, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if session.is_some() {
            return Err("Renode debugger already started".into());
        }
        let endpoint = match target {
            RenodeTarget::SpikePrime => supervisor.start_spike_backend(backend)?,
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
        let (target, backend) = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "Renode debugger unavailable".to_owned())?;
            let target = session
                .as_ref()
                .map(|active| (active.target, active.backend.clone()));
            if let Some(active) = session.as_mut() {
                if active.running.load(Ordering::Acquire) {
                    let _ = active.interrupt.request();
                }
            }
            session.take();
            target.ok_or_else(|| "Renode debugger is not started".to_owned())?
        };
        supervisor.teardown(TeardownReason::Reset);
        self.start_target(supervisor, target, backend.as_deref())?;
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
            }
            running.store(false, Ordering::Release);
        });
        match started_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(()) => Ok("running"),
            Err(_) => Err("Renode debugger failed to run".into()),
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
