//! The reference Scratch Link as a connection path, on Apple platforms only.
//!
//! There is deliberately no Rust protocol code here. The JSON-RPC lives in the
//! Scratch Foundation's own Swift, vendored under
//! `../../vendor/scratch-link-swift` and generated into the plugin's iOS target
//! by `scripts/gen-scratchlink-swift.mjs`. This crate exists to register that
//! plugin and nothing else — a second Rust implementation is exactly what this
//! path is meant to be checked against, not another copy of.
//!
//! Not built for Android: the vendored implementation is Swift/CoreBluetooth.
//! Android reaches BLE through `scratchlink/ble.rs` and BTC through
//! `scratchlink/bt_android.rs` as before.
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_scratchlink_original);

/// Register the plugin. A no-op shell off iOS so the app can depend on it
/// unconditionally without `cfg` at every call site.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("scratchlink-original")
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            _api.register_ios_plugin(init_plugin_scratchlink_original)?;
            Ok(())
        })
        .build()
}
