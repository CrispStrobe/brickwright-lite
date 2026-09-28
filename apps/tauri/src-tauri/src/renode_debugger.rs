//! Semantic owner for the optional SPIKE Prime Renode session.
//!
//! It returns status words only. Ports, tokens, paths and process handles stay
//! in native state and cannot cross into either webview.

use crate::renode_supervisor::{RenodeEndpoint, RenodeSupervisor, TeardownReason};
use std::sync::Mutex;

pub(crate) struct RenodeDebugger {
    endpoint: Mutex<Option<RenodeEndpoint>>,
}

impl RenodeDebugger {
    pub(crate) fn new() -> Self {
        Self {
            endpoint: Mutex::new(None),
        }
    }

    pub(crate) fn start(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        let mut endpoint = self
            .endpoint
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        if endpoint.is_some() {
            return Err("Renode debugger already started".into());
        }
        *endpoint = Some(supervisor.start_spike()?);
        Ok("ready")
    }

    pub(crate) fn close(&self, supervisor: &RenodeSupervisor) -> Result<&'static str, String> {
        let mut endpoint = self
            .endpoint
            .lock()
            .map_err(|_| "Renode debugger unavailable".to_owned())?;
        endpoint.take();
        supervisor.teardown(TeardownReason::ProjectClose);
        Ok("closed")
    }

    #[cfg(test)]
    fn has_endpoint(&self) -> bool {
        self.endpoint.lock().unwrap().is_some()
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
}
