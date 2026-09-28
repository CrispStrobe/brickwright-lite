//! Semantic owner for optional architecture-aware Renode sessions.
//!
//! It returns status words only. Ports, tokens, paths and process handles stay
//! in native state and cannot cross into either webview.

use crate::renode_brick_state::BrickStateFeed;
use crate::renode_rsp::{Arm32Architecture, RenodeRsp, RenodeRspInterrupt};
use crate::renode_supervisor::{RenodeSupervisor, TeardownReason};
use serde_json::{json, Value};
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
const EV3_EVIDENCE_TIMEOUT: Duration = Duration::from_secs(2);
const EV3_UART_EVIDENCE: &[u8] = b"EV3 ARM9 IRQ\n";

struct Session {
    rsp: Arc<Mutex<RenodeRsp>>,
    interrupt: RenodeRspInterrupt,
    running: Arc<AtomicBool>,
    target: RenodeTarget,
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
    Ev3(PathBuf),
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
        self.start_target(supervisor, RenodeTarget::SpikePrime)
    }

    pub(crate) fn start_ev3(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        self.start_target(supervisor, RenodeTarget::Ev3)
    }

    fn start_target(
        &self,
        supervisor: &RenodeSupervisor,
        target: RenodeTarget,
    ) -> Result<&'static str, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if session.is_some() {
            return Err("Renode debugger already started".into());
        }
        let endpoint = match target {
            RenodeTarget::SpikePrime => supervisor.start_spike()?,
            RenodeTarget::Ev3 => supervisor.start_ev3()?,
        };
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.gdb_port);
        let deadline = Instant::now() + STARTUP_TIMEOUT;
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
                let state_deadline = Instant::now() + STARTUP_TIMEOUT;
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
            RenodeTarget::Ev3 => TargetState::Ev3(
                endpoint
                    .uart_evidence()
                    .ok_or_else(|| "EV3 UART evidence unavailable".to_owned())?
                    .to_path_buf(),
            ),
        };
        *session = Some(Session {
            rsp: Arc::new(Mutex::new(rsp)),
            interrupt,
            running: Arc::new(AtomicBool::new(false)),
            target,
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
        let target = {
            let mut session = self
                .session
                .lock()
                .map_err(|_| "Renode debugger unavailable".to_owned())?;
            let target = session.as_ref().map(|active| active.target);
            if let Some(active) = session.as_mut() {
                if active.running.load(Ordering::Acquire) {
                    let _ = active.interrupt.request();
                }
            }
            session.take();
            target.ok_or_else(|| "Renode debugger is not started".to_owned())?
        };
        supervisor.teardown(TeardownReason::Reset);
        self.start_target(supervisor, target)?;
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
            TargetState::Spike(state) => serde_json::to_value(state.latest()?)
                .map_err(|_| "brick-state snapshot unavailable".to_owned()),
            TargetState::Ev3(path) => {
                let deadline = Instant::now() + EV3_EVIDENCE_TIMEOUT;
                loop {
                    match std::fs::read(path) {
                        Ok(uart) if uart == EV3_UART_EVIDENCE => break,
                        Ok(uart) if EV3_UART_EVIDENCE.starts_with(&uart) => {}
                        Ok(_) => return Err("EV3 UART/AINTC evidence is invalid".into()),
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(_) => return Err("EV3 UART evidence unavailable".into()),
                    }
                    if Instant::now() >= deadline {
                        return Err("EV3 UART/AINTC evidence is incomplete".into());
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Ok(json!({
                    "schemaVersion": 1,
                    "type": "snapshot",
                    "target": {"board": "ev3", "architecture": "arm926ej-s"},
                    "evidence": {"uart": "EV3 ARM9 IRQ\n", "aintcIrq": true}
                }))
            }
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
        assert_eq!(debugger.reset(&supervisor).unwrap(), "reset");
        assert_eq!(debugger.close(&supervisor).unwrap(), "closed");
    }
}
