//! Brickwright native app (Tauri 2) — shared entry point for desktop and mobile.

mod scratchlink;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Logging → stdout on desktop, logcat/oslog on mobile.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // BLE transport (btleplug on desktop/iOS; Tauri Android plugin on Android).
        .plugin(tauri_plugin_blec::init())
        .setup(|_app| {
            // Bring up the local ScratchLink WS server the web VM dials.
            scratchlink::start();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Brickwright application");
}
