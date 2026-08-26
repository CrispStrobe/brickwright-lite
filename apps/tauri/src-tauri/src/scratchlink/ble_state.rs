//! Why BLE is not working, in words the web side can show a user.
//!
//! The transport is btleplug (tauri-plugin-blec) on every platform. It reports
//! whether a *call* failed, but not whether the adapter was ever in a state
//! where the call could have worked — and on Apple platforms `start_scan`
//! against a central that is not powered on is a silent no-op (see
//! `ble_apple.m`). So the two Apple answers come from a small CoreBluetooth
//! probe, and every other platform reports "unknown", which the UI renders as
//! "could not be determined" rather than as a problem.

use serde_json::{json, Value};

#[cfg(target_vendor = "apple")]
extern "C" {
    fn bw_ble_authorization() -> std::ffi::c_int;
    fn bw_ble_power_state() -> std::ffi::c_int;
}

/// CBManagerAuthorization → a stable string the web side switches on.
#[cfg(target_vendor = "apple")]
fn authorization() -> &'static str {
    match unsafe { bw_ble_authorization() } {
        0 => "notDetermined",
        1 => "restricted",
        2 => "denied",
        3 => "allowed",
        _ => "unknown",
    }
}

/// CBManagerState → a stable string the web side switches on.
#[cfg(target_vendor = "apple")]
fn power_state() -> &'static str {
    match unsafe { bw_ble_power_state() } {
        1 => "resetting",
        2 => "unsupported",
        3 => "unauthorized",
        4 => "poweredOff",
        5 => "poweredOn",
        // 0, and anything the SDK adds later.
        _ => "unknown",
    }
}

#[cfg(not(target_vendor = "apple"))]
fn authorization() -> &'static str {
    "unknown"
}

#[cfg(not(target_vendor = "apple"))]
fn power_state() -> &'static str {
    "unknown"
}

/// A one-line human explanation, or `None` when nothing is known to be wrong.
/// Deliberately actionable: every string names the place the user has to go.
fn advice(auth: &str, power: &str) -> Option<&'static str> {
    match (auth, power) {
        ("denied", _) => Some(
            "Bluetooth permission is denied for Brickwright. \
             Turn it on in Settings › Privacy & Security › Bluetooth › Brickwright.",
        ),
        ("restricted", _) => Some(
            "Bluetooth is restricted on this device (Screen Time / MDM), \
             so Brickwright cannot use it.",
        ),
        (_, "poweredOff") => Some("Bluetooth is switched off. Turn it on in Settings › Bluetooth."),
        (_, "unauthorized") => Some(
            "The system has not authorised Brickwright to use Bluetooth. \
             Check Settings › Privacy & Security › Bluetooth.",
        ),
        (_, "unsupported") => Some("This device has no Bluetooth Low Energy radio."),
        ("notDetermined", _) => Some(
            "Brickwright has not asked for Bluetooth permission yet — \
             the prompt appears the first time you connect to a hub.",
        ),
        _ => None,
    }
}

/// The payload behind the `getStatus` JSON-RPC method. `usable` is the single
/// bit a caller needs; the rest is for the diagnostics panel.
pub fn status(scanning: bool, connected: bool) -> Value {
    let auth = authorization();
    let power = power_state();
    // "unknown" means we could not ask, not that the answer was bad — treating
    // it as a failure would make every non-Apple platform look broken.
    let usable = !matches!(auth, "denied" | "restricted")
        && !matches!(power, "poweredOff" | "unauthorized" | "unsupported");
    json!({
        "platform": std::env::consts::OS,
        "authorization": auth,
        "powerState": power,
        "usable": usable,
        "scanning": scanning,
        "connected": connected,
        "advice": advice(auth, power),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denied_permission_is_reported_before_power_state() {
        // A denied app on a phone with Bluetooth also switched off should be
        // told about the permission, which it can fix, first.
        assert!(advice("denied", "poweredOff").unwrap().contains("permission is denied"));
    }

    #[test]
    fn powered_off_is_reported_when_permission_is_fine() {
        assert!(advice("allowed", "poweredOff").unwrap().contains("switched off"));
    }

    #[test]
    fn a_healthy_adapter_has_no_advice() {
        assert!(advice("allowed", "poweredOn").is_none());
    }

    #[test]
    fn unknown_is_not_treated_as_a_fault() {
        // Every non-Apple platform reports unknown/unknown. That must not read
        // as "BLE is broken", or Linux and Windows show a permanent warning.
        assert!(advice("unknown", "unknown").is_none());
        let s = status(false, false);
        assert_eq!(s["usable"], json!(true));
    }

    #[test]
    fn status_carries_the_live_flags() {
        let s = status(true, true);
        assert_eq!(s["scanning"], json!(true));
        assert_eq!(s["connected"], json!(true));
    }
}
