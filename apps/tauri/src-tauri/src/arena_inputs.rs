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
            && matches!(value["topology"].as_str(), Some("default" | "six-motors")))
        || (keys(value, &["backend", "topology"]) && value["backend"] == "micropython"
            && value["topology"] == "six-motors")
}
pub(crate) fn valid(value: &Value) -> bool {
    if !keys(value, &["sensors", "loads"]) {
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
            json!({"backend":"nuttx","topology":"default"}),json!({"backend":"nuttx","topology":"six-motors"}),json!({"backend":"micropython","topology":"six-motors"})] {
            assert!(valid_spike_start(&value));
        }
        for value in [json!({"backend":"micropython","path":"secret.bin"}), json!({"backend":"micropython","topology":"default"}), json!({"backend":"guest","topology":"six-motors"}),json!({"topology":"six-motors"}),
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
