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
