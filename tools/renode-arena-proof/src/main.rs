// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Source-only test driver for the actual managed runtime. No listener or monitor passthrough.
#![allow(dead_code)]
#[path = "../../../apps/tauri/src-tauri/src/arena_inputs.rs"]
mod arena_inputs;
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
fn main() {
    let supervisor = renode_supervisor::RenodeSupervisor::new();
    let debugger = renode_debugger::RenodeDebugger::new();
    let input = std::io::stdin();
    let mut reader = input.lock();
    loop {
        let mut line = String::new();
        let count = std::io::Read::take(&mut reader, 4097).read_line(&mut line);
        if matches!(count, Ok(0)) {
            break;
        }
        let line = count.map(|_| line);
        let response = (|| -> Result<Value, String> {
            let line = line.map_err(|_| "input unavailable".to_owned())?;
            if line.len() > 4096 {
                return Err("input exceeds bounds".into());
            }
            let request: Value =
                serde_json::from_str(&line).map_err(|_| "malformed input".to_owned())?;
            let args = &request["args"];
            if !request.as_object().is_some_and(|map| map.len() == 2) {
                return Err("invalid request".into());
            }
            let operation = request["operation"].as_str().ok_or("missing operation")?;
            if operation == "arena.inputs.write" {
                if !arena_inputs::valid(args) {
                    return Err("invalid arena inputs".into());
                }
                debugger.ensure_target(renode_debugger::RenodeTarget::SpikePrime)?;
                return debugger.spike_arena_inputs(args.clone());
            }
            if !args.as_object().is_some_and(|map| map.is_empty()) {
                return Err("operation takes no arguments".into());
            }
            match operation {
                "session.start" => debugger.start(&supervisor).map(|v| json!(v)),
                "session.close" => debugger.close(&supervisor).map(|v| json!(v)),
                "run" => debugger.run().map(|v| json!(v)),
                "pause" => debugger.pause().map(|v| json!(v)),
                "state.read" => debugger.state(),
                _ => Err("operation unsupported".into()),
            }
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
