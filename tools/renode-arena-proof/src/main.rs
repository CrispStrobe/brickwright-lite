// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Source-only test driver for the actual managed runtime. No listener or monitor passthrough.
#![allow(dead_code)]
#[path = "../../../apps/tauri/src-tauri/src/spike_flash_store.rs"]
mod spike_flash_store;
#[path = "../../../apps/tauri/src-tauri/src/arena_inputs.rs"]
mod arena_inputs;
#[path = "../../../apps/tauri/src-tauri/src/native_policy.rs"]
mod native_policy;
#[path = "../../../apps/tauri/src-tauri/src/renode_brick_state.rs"]
mod renode_brick_state;
#[path = "../../../apps/tauri/src-tauri/src/renode_debugger.rs"]
mod renode_debugger;
#[path = "../../../apps/tauri/src-tauri/src/renode_rsp.rs"]
mod renode_rsp;
#[path = "../../../apps/tauri/src-tauri/src/renode_supervisor.rs"]
mod renode_supervisor;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::time::{Duration, Instant};

// This is a test transport, not the Tauri WebView adapter or its ACL. Reuse the
// production policy before the small closed test executor reaches real I/O.
struct ProofPolicy {
    policy: native_policy::NativePolicyState,
    lease: Option<native_policy::LeaseId>,
    sequence: u64,
    issued: Instant,
}
impl ProofPolicy {
    fn new() -> Self {
        Self {
            policy: native_policy::NativePolicyState::new(),
            lease: None,
            sequence: 0,
            issued: Instant::now(),
        }
    }
    fn authorize(&mut self, request: &Value) -> Result<native_policy::Operation, String> {
        if !request
            .as_object()
            .is_some_and(|v| v.len() == 2 && v.contains_key("args"))
        {
            return Err("invalid request".into());
        }
        let suffix = request["operation"].as_str().ok_or("missing operation")?;
        if !matches!(
            suffix,
            "session.start"
                | "session.close"
                | "run"
                | "pause"
                | "state.read"
                | "arena.inputs.write"
                | "arena.program.load"
                | "program.packet"
                | "program.storage.submit"
        ) {
            return Err("operation unsupported".into());
        }
        let name = format!("renode.spike.{suffix}");
        let operation = native_policy::Operation::parse(&name).ok_or("operation unsupported")?;
        // Renew host-owned leases before the production 256-call/60-second
        // bounds. Neither the editor nor the HTTP caller chooses a lease.
        if self.lease.is_none()
            || self.sequence >= 128
            || self.issued.elapsed() >= Duration::from_secs(30)
        {
            self.policy
                .revoke_all("capability-broker")
                .map_err(|_| "policy unavailable")?;
            let mut bytes = [0u8; 32];
            getrandom::getrandom(&mut bytes).map_err(|_| "random unavailable")?;
            let id = native_policy::LeaseId::from_host_random(bytes);
            self.lease = Some(
                self.policy
                    .issue_broker_lease("capability-broker", 1, id)
                    .map_err(|_| "policy unavailable")?,
            );
            self.sequence = 0;
            self.issued = Instant::now();
        }
        self.policy
            .authorize_broker_call(
                "capability-broker",
                self.lease.unwrap(),
                self.sequence,
                &name,
                "renode/spike-prime",
                &request["args"],
            )
            .map_err(|_| "capability refused")?;
        self.sequence += 1;
        Ok(operation)
    }
}

fn execute(
    operation: native_policy::Operation,
    args: &Value,
    debugger: &renode_debugger::RenodeDebugger,
    supervisor: &renode_supervisor::RenodeSupervisor,
) -> Result<Value, String> {
    use native_policy::Operation::*;
    if operation != RenodeSpikeStart {
        debugger.ensure_target(renode_debugger::RenodeTarget::SpikePrime)?;
    }
    match operation {
        RenodeSpikeStart => debugger
            .start_spike_profile(
                supervisor,
                args["backend"].as_str(),
                renode_supervisor::SpikeTopology::parse(args["topology"].as_str())?,
            )
            .map(|v| json!(v)),
        RenodeSpikeClose => debugger.close(supervisor).map(|v| json!(v)),
        RenodeSpikeRun => debugger.run().map(|v| json!(v)),
        RenodeSpikePause => debugger.pause().map(|v| json!(v)),
        RenodeSpikeStateRead => debugger.state(),
        RenodeSpikeArenaInputs => debugger.spike_arena_inputs(args.clone()),
        RenodeSpikeArenaProgram => debugger.spike_arena_program(args.clone()),
        RenodeSpikeProgramPacket => debugger.spike_program_packet(args.clone()),
        RenodeSpikeProgramStorageSubmit => debugger.spike_program_storage_submit(args.clone()),
        _ => Err("operation unsupported".into()),
    }
}
fn main() {
    let supervisor = renode_supervisor::RenodeSupervisor::new();
    // Native harness configuration only. No editor message contains a path,
    // and the production setter validates/configures it before any session.
    if let Some(root) = std::env::var_os("BW_PROOF_FLASH_ROOT") {
        if let Err(error) = supervisor.set_flash_store_root(std::path::PathBuf::from(root)) {
            eprintln!("proof flash initialization refused: {error}");
            std::process::exit(2);
        }
    }
    let debugger = renode_debugger::RenodeDebugger::new();
    let mut policy = ProofPolicy::new();
    let input = std::io::stdin();
    let mut reader = input.lock();
    loop {
        let mut line = String::new();
        let count = std::io::Read::take(&mut reader, 16385).read_line(&mut line);
        if matches!(count, Ok(0)) {
            break;
        }
        let line = count.map(|_| line);
        let response = (|| -> Result<Value, String> {
            let line = line.map_err(|_| "input unavailable".to_owned())?;
            if line.len() > 16384 {
                return Err("input exceeds bounds".into());
            }
            let request: Value =
                serde_json::from_str(&line).map_err(|_| "malformed input".to_owned())?;
            execute(
                policy.authorize(&request)?,
                &request["args"],
                &debugger,
                &supervisor,
            )
        })();
        println!(
            "{}",
            match response {
                Ok(result) => json!({"result":result}),
                Err(error) => json!({"error":error}),
            }
        );
        let _ = std::io::stdout().flush();
    }
    let _ = debugger.close(&supervisor);
}

#[cfg(test)]
mod proof_tests {
    use super::*;
    #[test]
    fn guest_and_explicit_six_motor_start_use_production_policy() {
        let mut policy = ProofPolicy::new();
        assert!(policy
            .authorize(&json!({"operation":"session.start","args":{}}))
            .is_ok());
        assert!(policy.authorize(&json!({"operation":"session.start","args":{"backend":"nuttx","topology":"six-motors"}})).is_ok());
        for args in [
            json!({"backend":"guest","topology":"six-motors"}),
            json!({"backend":"nuttx","topology":"other"}),
            json!({"path":"/tmp/x"}),
        ] {
            assert!(policy
                .authorize(&json!({"operation":"session.start","args":args}))
                .is_err());
        }
    }
    #[test]
    fn closed_operations_refuse_passthrough_and_malformed_packets() {
        let mut policy = ProofPolicy::new();
        for request in [
            json!({"operation":"memory.read","args":{"address":0,"length":4}}),
            json!({"operation":"monitor","args":{"command":"quit"}}),
            json!({"operation":"program.packet","args":{"bytes":[256]}}),
            json!({"operation":"program.storage.submit","args":{"bytes":[]}}),
            json!({"operation":"run","args":{"extra":true}}),
            json!({"operation":"run","args":{},"extra":true}),
        ] {
            assert!(policy.authorize(&request).is_err(), "{request}");
        }
        assert!(policy
            .authorize(&json!({"operation":"state.read","args":{}}))
            .is_ok());
    }
    #[test]
    fn storage_submission_is_nonexecution_and_host_lease_renewal_is_bounded() {
        let mut policy = ProofPolicy::new();
        for op in [8, 9] {
            assert!(policy
                .authorize(&json!({"operation":"program.storage.submit",
                "args":{"bytes":[112,1,op,0,1,0,0,0]}}))
                .is_ok());
        }
        assert!(policy
            .authorize(&json!({"operation":"program.storage.submit",
            "args":{"bytes":[112,1,3,0,1,0,0,0]}}))
            .is_err());
        for _ in 0..260 {
            assert!(policy
                .authorize(&json!({"operation":"state.read","args":{}}))
                .is_ok());
        }
        assert!(policy.sequence < 128);
    }
}
