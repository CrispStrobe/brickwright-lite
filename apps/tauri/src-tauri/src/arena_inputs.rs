// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
use serde_json::Value;
use std::collections::BTreeSet;
fn keys(value: &Value, names: &[&str]) -> bool {
    value.as_object().is_some_and(|map| {
        map.len() == names.len() && names.iter().all(|key| map.contains_key(*key))
    })
}
fn integer(value: &Value, min: i64, max: i64) -> bool {
    value.as_i64().is_some_and(|v| (min..=max).contains(&v))
}
pub(crate) fn valid_spike_start(value: &Value) -> bool {
    keys(value, &[]) || (keys(value, &["backend"]) && matches!(value["backend"].as_str(), Some("guest" | "nuttx" | "micropython")))
        || (keys(value, &["backend", "topology"]) && value["backend"] == "nuttx"
            && matches!(value["topology"].as_str(), Some("default" | "six-motors" | "dual-ultrasonic")))
        || (keys(value, &["backend", "topology"]) && value["backend"] == "micropython"
            && value["topology"] == "six-motors")
}
pub(crate) fn valid_hub_input(value: &Value) -> bool {
    let buttons = &value["buttons"];
    let imu = &value["imuRaw"];
    keys(value, &["buttons", "imuRaw"])
        && keys(buttons, &["left", "center", "right", "bluetooth"])
        && ["left", "center", "right", "bluetooth"]
            .iter()
            .all(|name| buttons[name].is_boolean())
        && keys(imu, &["temperature", "angularRate", "acceleration"])
        && integer(&imu["temperature"], -32768, 32767)
        && ["angularRate", "acceleration"].iter().all(|name| {
            imu[name].as_array().is_some_and(|values| {
                values.len() == 3 && values.iter().all(|v| integer(v, -32768, 32767))
            })
        })
}
pub(crate) fn valid(value: &Value) -> bool {
    if !(keys(value, &["sensors", "loads"]) ||
        (keys(value, &["sensors", "loads", "hub"]) && valid_hub_input(&value["hub"]))) {
        return false;
    }
    let (Some(sensors), Some(loads)) = (value["sensors"].as_array(), value["loads"].as_array())
    else {
        return false;
    };
    if sensors.len() > 6 || loads.len() > 6 {
        return false;
    }
    let mut ports = BTreeSet::new();
    for item in sensors.iter().chain(loads) {
        let Some(port) = item["port"].as_str() else {
            return false;
        };
        if !matches!(port, "A" | "B" | "C" | "D" | "E" | "F") || !ports.insert(port) {
            return false;
        }
    }
    for item in sensors {
        if !keys(item, &["port", "kind", "values"]) {
            return false;
        }
        let values = &item["values"];
        let ok = match item["kind"].as_str() {
            Some("distance") => {
                keys(values, &["distanceMillimeters"])
                    && integer(&values["distanceMillimeters"], -1, 65535)
            }
            Some("color") => {
                keys(values, &["colorId", "reflectionPercent", "ambientPercent"])
                    && integer(&values["colorId"], 0, 255)
                    && integer(&values["reflectionPercent"], 0, 100)
                    && integer(&values["ambientPercent"], 0, 100)
            }
            Some("force") => {
                keys(values, &["forcePercent", "pressed"])
                    && integer(&values["forcePercent"], 0, 100)
                    && values["pressed"].is_boolean()
            }
            _ => false,
        };
        if !ok {
            return false;
        }
    }
    loads
        .iter()
        .all(|item| keys(item, &["port", "percent"]) && integer(&item["percent"], 0, 100))
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn topology_launch_arguments_are_closed_and_explicit_for_supported_profiles() {
        for value in [json!({}),json!({"backend":"guest"}),json!({"backend":"nuttx"}),json!({"backend":"micropython"}),
            json!({"backend":"nuttx","topology":"default"}),json!({"backend":"nuttx","topology":"six-motors"}),json!({"backend":"nuttx","topology":"dual-ultrasonic"}),json!({"backend":"micropython","topology":"six-motors"})] {
            assert!(valid_spike_start(&value));
        }
        for value in [json!({"backend":"micropython","topology":"dual-ultrasonic"}),json!({"backend":"micropython","path":"secret.bin"}), json!({"backend":"micropython","topology":"default"}), json!({"backend":"guest","topology":"six-motors"}),json!({"topology":"six-motors"}),
            json!({"backend":"nuttx","topology":"six-motors;quit"}),json!({"backend":"nuttx","topology":true}),
            json!({"backend":"nuttx","topology":"six-motors","path":"/tmp/model"})] {
            assert!(!valid_spike_start(&value));
        }
    }

    #[test]
    fn frames_are_closed_bounded_and_unique() {
        assert!(valid(
            &json!({"sensors":[{"port":"D","kind":"distance","values":{"distanceMillimeters":-1}}],"loads":[{"port":"A","percent":100}]})
        ));
        for bad in [
            json!({"sensors":[],"loads":[],"monitor":"run"}),
            json!({"sensors":[],"loads":[{"port":"A","percent":true}]}),
            json!({"sensors":[],"loads":[{"port":"A","percent":101}]}),
            json!({"sensors":[],"loads":[{"port":"A","percent":1},{"port":"A","percent":2}]}),
        ] {
            assert!(!valid(&bad));
        }
    }
}

/// Closed instruction ABI for our simulation guest; never executable/memory uploads.
pub(crate) fn valid_program(value: &Value) -> bool {
    if !keys(value, &["version", "instructions"]) || value["version"].as_u64() != Some(1) {
        return false;
    }
    let Some(code) = value["instructions"].as_array() else {
        return false;
    };
    if code.is_empty() || code.len() > 256 {
        return false;
    }
    let n = code.len() as i64;
    for instruction in code {
        let Some(words) = instruction.as_array() else {
            return false;
        };
        if words.len() != 4 {
            return false;
        }
        let values: Option<Vec<i64>> = words.iter().map(Value::as_i64).collect();
        let Some(v) = values else {
            return false;
        };
        let (op, a, b, c) = (v[0], v[1], v[2], v[3]);
        let ok = match op {
            0 => a == 0 && b == 0 && c == 0,
            1 => (0..=1).contains(&a) && (-1110..=1110).contains(&b) && c == 0,
            2 => (0..=120000).contains(&a) && b == 0 && c == 0,
            3 | 5 => {
                let bound = match a {
                    1 | 2 => 65535,
                    3 => 1,
                    4 => 255,
                    5 | 6 => 100,
                    _ => -1,
                };
                (1..=6).contains(&a)
                    && (0..=bound).contains(&b)
                    && (if op == 3 { c == 0 } else { (0..n).contains(&c) })
            }
            4 => (0..n).contains(&a) && b == 0 && c == 0,
            6 => (0..=1).contains(&a) && (-36000..=36000).contains(&b) && (1..=1110).contains(&c),
            _ => false,
        };
        if !ok {
            return false;
        }
    }
    code.last() == Some(&serde_json::json!([0, 0, 0, 0]))
}

#[cfg(test)]
mod program_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn programs_are_closed_bounded_and_do_not_accept_executable_uploads() {
        assert!(valid_program(
            &json!({"version":1,"instructions":[[1,0,-1110,0],[3,1,65535,0],[6,1,36000,1110],[0,0,0,0]]})
        ));
        for code in [
            json!([]),
            json!([[1, 0, 1111, 0], [0, 0, 0, 0]]),
            json!([[0, false, 0, 0]]),
            json!([[4, 2, 0, 0], [0, 0, 0, 0]]),
            json!([[3, 3, 2, 0], [0, 0, 0, 0]]),
            json!([[1, 1, 300, 0]]),
        ] {
            assert!(!valid_program(&json!({"version":1,"instructions":code})));
        }
        assert!(!valid_program(
            &json!({"version":1,"instructions":[[0,0,0,0]],"address":0x20000000})
        ));
    }
}

/// A bounded packet for our firmware upload service, never monitor commands.
pub(crate) fn valid_nuttx_packet(value: &Value) -> bool {
    if !keys(value, &["bytes"]) { return false; }
    let Some(bytes) = value["bytes"].as_array() else { return false; };
    if !(8..=20).contains(&bytes.len()) || bytes.iter().any(|b| !integer(b, 0, 255)) { return false; }
    let b: Vec<u8> = bytes.iter().map(|v| v.as_u64().unwrap() as u8).collect();
    if b[0] != 0x70 || b[1] != 1 || b[3] != 0 || b[2] > 9 { return false; }
    if b[4..8].iter().all(|v| *v == 0) && b[2] != 5 { return false; }
    match b[2] {
        0 | 7 => b.len() == 16,
        1 => (11..=20).contains(&b.len()),
        _ => b.len() == 8,
    }
}

/// Deferred storage submission cannot carry upload or execution instructions.
pub(crate) fn valid_nuttx_storage_submit(value: &Value) -> bool {
    valid_nuttx_packet(value)
        && value["bytes"].as_array().is_some_and(|bytes| bytes.len() == 8)
        && matches!(value["bytes"][2].as_u64(), Some(8 | 9))
}

#[cfg(test)]
mod nuttx_packet_tests {
    use super::valid_nuttx_packet;
    use serde_json::json;
    #[test]
    fn deferred_storage_is_a_closed_nonexecution_operation() {
        for op in [8, 9] {
            assert!(super::valid_nuttx_storage_submit(&json!({"bytes":[112,1,op,0,1,0,0,0]})));
            assert!(!super::valid_nuttx_storage_submit(&json!({"bytes":[112,1,op,0,0,0,0,0]})));
        }
        for op in [2, 3, 4, 5, 6] {
            assert!(!super::valid_nuttx_storage_submit(&json!({"bytes":[112,1,op,0,1,0,0,0]})));
        }
        assert!(!super::valid_nuttx_storage_submit(&json!({"bytes":[112,1,8,0,1,0,0,0],"path":"program"})));
    }

    #[test]
    fn packets_are_bounded_and_cannot_select_memory_or_monitor_commands() {
        assert!(valid_nuttx_packet(&json!({"bytes":[112,1,5,0,0,0,0,0]})));
        assert!(valid_nuttx_packet(&json!({"bytes":[112,1,4,0,1,0,0,0]})));
        for op in [8, 9] {
            assert!(valid_nuttx_packet(&json!({"bytes":[112,1,op,0,255,255,255,255]})));
            assert!(!valid_nuttx_packet(&json!({"bytes":[112,1,op,0,0,0,0,0]})));
            assert!(!valid_nuttx_packet(&json!({"bytes":[112,1,op,0,1,0,0,0,0]})));
        }
        assert!(!valid_nuttx_packet(&json!({"bytes":[112,1,10,0,1,0,0,0]})));
        for value in [json!({"bytes":[112,1,3,0,0,0,0,0]}),
            json!({"bytes":[112,1,5,0,0,0,0,0],"address":0}),
            json!({"bytes":[112,1,5,0,0,0,0,true]}),
            json!({"bytes":[112,1,5,0,0,0,0,256]}),
            json!({"bytes":[112,1,7,0,1,0,0,0]}),
            json!({"bytes":[112,1,1,0,1,0,0,0,0,0]})] {
            assert!(!valid_nuttx_packet(&value));
        }
    }
}

#[cfg(test)]
mod hub_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn hub_inputs_are_closed_boolean_buttons_and_signed_raw_samples() {
        let sample = json!({"sensors":[],"loads":[],"hub":{
            "buttons":{"left":true,"center":false,"right":false,"bluetooth":true},
            "imuRaw":{"temperature":-32768,"angularRate":[32767,0,-1],"acceleration":[-32768,0,32767]}}});
        assert!(valid(&sample));
        for (path, value) in [
            (vec!["hub", "buttons", "left"], json!(1)),
            (vec!["hub", "buttons", "monitor"], json!(false)),
            (vec!["hub", "imuRaw", "temperature"], json!(32768)),
            (vec!["hub", "imuRaw", "temperature"], json!(true)),
            (vec!["hub", "imuRaw", "angularRate"], json!([1, 2])),
            (vec!["hub", "imuRaw", "acceleration"], json!([0, -32769, 0])),
            (vec!["hub", "imuRaw", "path"], json!("sysbus")),
        ] {
            let mut bad = sample.clone();
            let mut field = &mut bad;
            for key in path {
                field = &mut field[key];
            }
            *field = value;
            assert!(!valid(&bad));
        }
    }
}

// Robot Lab lockstep (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.1, §4 R13a). One quantum of
// virtual time per exchange: the physics shafts and sensor readings at t_k in, the
// emulator runs [t_k, t_k + quantum]. Closed DTOs: no monitor text, paths or addresses.
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// Exactly the quanta the Runtime admits (renode-spike-prime#59 `QUANTA_US`): one physics
/// step (5 ms) or two. Anything else would pass here only to be refused there, and a
/// refused lockstep command ends the feed.
fn lockstep_quantum(value: &Value) -> bool {
    matches!(value.as_i64(), Some(5000 | 10000)) && value.is_u64()
}

/// `lockstep.begin {quantumUs}`.
pub(crate) fn valid_lockstep_begin(value: &Value) -> bool {
    keys(value, &["quantumUs"]) && lockstep_quantum(&value["quantumUs"])
}

/// `lockstep.step {quantumUs, expectClockNs, shafts, sensors, hub?}`. Each port A–F
/// appears at most once across shafts and sensors; sensors use the `arena.inputs`
/// vocabulary and units; `hub` is the `prime-hub-io/v1` input as in `arena.inputs`.
pub(crate) fn valid_lockstep_step(value: &Value) -> bool {
    let base = ["quantumUs", "expectClockNs", "shafts", "sensors"];
    if !(keys(value, &base)
        || (keys(value, &["quantumUs", "expectClockNs", "shafts", "sensors", "hub"])
            && valid_hub_input(&value["hub"])))
    {
        return false;
    }
    if !lockstep_quantum(&value["quantumUs"])
        || !value["expectClockNs"].as_u64().is_some_and(|v| v <= MAX_SAFE_INTEGER)
    {
        return false;
    }
    let (Some(shafts), Some(sensors)) = (value["shafts"].as_array(), value["sensors"].as_array())
    else {
        return false;
    };
    if shafts.len() > 6 || sensors.len() > 6 {
        return false;
    }
    let mut ports = BTreeSet::new();
    for item in shafts.iter().chain(sensors) {
        let Some(port) = item["port"].as_str() else {
            return false;
        };
        if !matches!(port, "A" | "B" | "C" | "D" | "E" | "F") || !ports.insert(port) {
            return false;
        }
    }
    let shafts_ok = shafts.iter().all(|item| {
        keys(item, &["port", "positionMdeg", "speedMdps"])
            && integer(&item["positionMdeg"], -(i64::from(i32::MAX)), i64::from(i32::MAX))
            && integer(&item["speedMdps"], -2_000_000, 2_000_000)
    });
    // A sensor entry is exactly one `arena.inputs` sensor: the same closed kinds and units.
    shafts_ok
        && sensors.iter().all(|item| {
            keys(item, &["port", "kind", "values"])
                && valid(&serde_json::json!({"sensors": [item], "loads": []}))
        })
}

/// `nuttx.program.control.submit {bytes}` (Runtime capability
/// `nuttx-program-deferred-start/v1`): a START (3) or STOP (4) packet that returns at
/// once, for program control inside lockstep where `program.packet`'s wall wait cannot
/// see a reply. Never upload, storage or execution of other operations.
pub(crate) fn valid_nuttx_program_control(value: &Value) -> bool {
    valid_nuttx_packet(value)
        && value["bytes"].as_array().is_some_and(|bytes| bytes.len() == 8)
        && matches!(value["bytes"][2].as_u64(), Some(3 | 4))
}

/// `lockstep.end {}`.
pub(crate) fn valid_lockstep_end(value: &Value) -> bool {
    keys(value, &[])
}

#[cfg(test)]
mod lockstep_tests {
    use super::*;
    use serde_json::json;

    /// The shapes overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/contract.js builds.
    fn contract_step() -> Value {
        json!({"quantumUs":5000,"expectClockNs":1_000_000_000u64,
            "shafts":[{"port":"A","positionMdeg":-123456,"speedMdps":360000},
                      {"port":"B","positionMdeg":2147483647,"speedMdps":-2000000}],
            "sensors":[{"port":"C","kind":"color","values":{"colorId":255,"reflectionPercent":42,"ambientPercent":0}},
                       {"port":"D","kind":"distance","values":{"distanceMillimeters":-1}},
                       {"port":"E","kind":"force","values":{"forcePercent":0,"pressed":false}}]})
    }

    #[test]
    fn program_control_is_start_or_stop_only() {
        for op in [3, 4] {
            assert!(valid_nuttx_program_control(&json!({"bytes":[112,1,op,0,1,0,0,0]})));
            assert!(!valid_nuttx_program_control(&json!({"bytes":[112,1,op,0,0,0,0,0]})));
            assert!(!valid_nuttx_program_control(&json!({"bytes":[112,1,op,0,1,0,0,0],"path":"x"})));
        }
        for op in [0, 1, 2, 5, 6, 7, 8, 9] {
            assert!(!valid_nuttx_program_control(&json!({"bytes":[112,1,op,0,1,0,0,0]})));
        }
    }

    #[test]
    fn lockstep_begin_and_end_are_closed() {
        for quantum in [5000, 10000] {
            assert!(valid_lockstep_begin(&json!({"quantumUs": quantum})));
        }
        for quantum in [0, 1000, 4000, 4999, 5001, 6000, 7000, 9000, 15000, 20000, -5000] {
            assert!(!valid_lockstep_begin(&json!({"quantumUs": quantum})), "{quantum}");
        }
        for bad in [json!({}), json!({"quantumUs":999}), json!({"quantumUs":20001}), json!({"quantumUs":7500}),
            json!({"quantumUs":5000.5}), json!({"quantumUs":"5000"}), json!({"quantumUs":5000,"monitor":"start"}),
            json!(null), json!([5000])] {
            assert!(!valid_lockstep_begin(&bad), "{bad}");
        }
        assert!(valid_lockstep_end(&json!({})));
        assert!(!valid_lockstep_end(&json!({"quantumUs":5000})));
        assert!(!valid_lockstep_end(&json!(null)));
    }

    #[test]
    fn lockstep_step_accepts_the_contract_shapes() {
        assert!(valid_lockstep_step(&contract_step()));
        assert!(valid_lockstep_step(&json!({"quantumUs":10000,"expectClockNs":0,"shafts":[],"sensors":[]})));
        let mut six = contract_step();
        six["sensors"] = json!([]);
        six["shafts"] = json!(["A","B","C","D","E","F"].iter()
            .map(|port| json!({"port":port,"positionMdeg":0,"speedMdps":0})).collect::<Vec<_>>());
        assert!(valid_lockstep_step(&six));
        let mut hub = contract_step();
        hub["hub"] = json!({"buttons":{"left":false,"center":true,"right":false,"bluetooth":false},
            "imuRaw":{"temperature":0,"angularRate":[0,0,0],"acceleration":[0,0,4096]}});
        assert!(valid_lockstep_step(&hub));
    }

    #[test]
    fn lockstep_step_refuses_each_malformed_variant() {
        type Mutation = Box<dyn Fn(&mut Value)>;
        let cases: Vec<(&str, Mutation)> = vec![
            ("extra key", Box::new(|v| v["monitor"] = json!("start"))),
            ("missing sensors", Box::new(|v| { v.as_object_mut().unwrap().remove("sensors"); })),
            ("quantum not whole ticks", Box::new(|v| v["quantumUs"] = json!(7500))),
            ("quantum below", Box::new(|v| v["quantumUs"] = json!(0))),
            ("quantum above", Box::new(|v| v["quantumUs"] = json!(25000))),
            ("quantum 4000", Box::new(|v| v["quantumUs"] = json!(4000))),
            ("quantum 6000", Box::new(|v| v["quantumUs"] = json!(6000))),
            ("quantum 20000", Box::new(|v| v["quantumUs"] = json!(20000))),
            ("quantum float", Box::new(|v| v["quantumUs"] = json!(5000.0))),
            ("negative clock", Box::new(|v| v["expectClockNs"] = json!(-1))),
            ("float clock", Box::new(|v| v["expectClockNs"] = json!(1.5))),
            ("unsafe clock", Box::new(|v| v["expectClockNs"] = json!(MAX_SAFE_INTEGER + 1))),
            ("port G", Box::new(|v| v["shafts"][0]["port"] = json!("G"))),
            ("lowercase port", Box::new(|v| v["shafts"][0]["port"] = json!("a"))),
            ("duplicate shaft", Box::new(|v| v["shafts"][1]["port"] = json!("A"))),
            ("shaft and sensor", Box::new(|v| v["sensors"][0]["port"] = json!("A"))),
            ("duplicate sensor", Box::new(|v| v["sensors"][1]["port"] = json!("C"))),
            ("float position", Box::new(|v| v["shafts"][0]["positionMdeg"] = json!(1.5))),
            ("position 2^31", Box::new(|v| v["shafts"][0]["positionMdeg"] = json!(2147483648i64))),
            ("position -2^31", Box::new(|v| v["shafts"][0]["positionMdeg"] = json!(-2147483648i64))),
            ("speed too fast", Box::new(|v| v["shafts"][0]["speedMdps"] = json!(2000001))),
            ("speed string", Box::new(|v| v["shafts"][0]["speedMdps"] = json!("0"))),
            ("shaft extra key", Box::new(|v| v["shafts"][0]["address"] = json!(0x20000000))),
            ("shaft missing speed", Box::new(|v| { v["shafts"][0].as_object_mut().unwrap().remove("speedMdps"); })),
            ("unknown sensor kind", Box::new(|v| v["sensors"][0]["kind"] = json!("gyro"))),
            ("sensor out of range", Box::new(|v| v["sensors"][1]["values"]["distanceMillimeters"] = json!(-2))),
            ("sensor extra value", Box::new(|v| v["sensors"][2]["values"]["raw"] = json!(1))),
            ("sensor extra key", Box::new(|v| v["sensors"][2]["load"] = json!(100))),
            ("shafts not a list", Box::new(|v| v["shafts"] = json!({"A": 0}))),
            ("seven shafts", Box::new(|v| v["shafts"] = json!(vec![json!({"port":"A","positionMdeg":0,"speedMdps":0}); 7]))),
            ("hub malformed", Box::new(|v| v["hub"] = json!({"buttons":{}}))),
            ("hub null", Box::new(|v| v["hub"] = json!(null))),
        ];
        for (name, mutate) in cases {
            let mut bad = contract_step();
            mutate(&mut bad);
            assert!(!valid_lockstep_step(&bad), "{name} was admitted");
        }
        assert!(!valid_lockstep_step(&json!(null)));
        assert!(!valid_lockstep_step(&json!([])));
    }
}
