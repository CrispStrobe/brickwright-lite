//! Semantic owner for the optional SPIKE Prime Renode session.
//!
//! It returns status words only. Ports, tokens, paths and process handles stay
//! in native state and cannot cross into either webview.

use crate::renode_brick_state::BrickStateFeed;
use crate::renode_rsp::{RenodeRsp, RenodeRspInterrupt};
use crate::renode_supervisor::{RenodeSupervisor, TeardownReason};
use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

struct Session {
    rsp: Arc<Mutex<RenodeRsp>>,
    interrupt: RenodeRspInterrupt,
    running: Arc<AtomicBool>,
    state: BrickStateFeed,
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
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if session.is_some() {
            return Err("Renode debugger already started".into());
        }
        let endpoint = supervisor.start_spike()?;
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.gdb_port);
        let deadline = Instant::now() + Duration::from_secs(5);
        let rsp = loop {
            match RenodeRsp::connect(address) {
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
        let state_address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), endpoint.state_port);
        let state_deadline = Instant::now() + Duration::from_secs(5);
        let state = loop {
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
        *session = Some(Session {
            rsp: Arc::new(Mutex::new(rsp)),
            interrupt,
            running: Arc::new(AtomicBool::new(false)),
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

    pub(crate) fn reset(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        {
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
        }
        supervisor.teardown(TeardownReason::Reset);
        self.start(supervisor)?;
        Ok("reset")
    }

    fn idle_rsp(&self) -> Result<Arc<Mutex<RenodeRsp>>, String> {
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
        Ok(Arc::clone(&active.rsp))
    }

    pub(crate) fn registers(&self) -> Result<Value, String> {
        let rsp = self.idle_rsp()?;
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
        result.insert("xpsr".into(), json!(registers.xpsr));
        Ok(Value::Object(result))
    }

    pub(crate) fn read_memory(&self, address: u32, length: usize) -> Result<String, String> {
        let rsp = self.idle_rsp()?;
        let bytes = rsp
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .read_memory(address, length)?;
        Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }

    pub(crate) fn set_breakpoint(&self, address: u32) -> Result<&'static str, String> {
        let rsp = self.idle_rsp()?;
        rsp.lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .set_breakpoint(address)?;
        Ok("set")
    }

    pub(crate) fn clear_breakpoint(&self, address: u32) -> Result<&'static str, String> {
        let rsp = self.idle_rsp()?;
        rsp.lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?
            .clear_breakpoint(address)?;
        Ok("cleared")
    }

    pub(crate) fn step(&self) -> Result<&'static str, String> {
        let rsp = self.idle_rsp()?;
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
        serde_json::to_value(active.state.latest()?)
            .map_err(|_| "brick-state snapshot unavailable".to_owned())
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
}
