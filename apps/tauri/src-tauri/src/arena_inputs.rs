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
