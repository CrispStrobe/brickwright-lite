//! Brickwright native app (Tauri 2) — shared entry point for desktop and mobile.

mod assetserver;
mod downloads;
mod fileio;
mod pico;
mod scratchlink;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Logging → stdout on desktop, logcat/oslog on mobile.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // BLE transport (btleplug on desktop/iOS; Tauri Android plugin on Android).
        .plugin(tauri_plugin_blec::init())
        // Native Save/Open dialogs, and deep links / .sb3 "open with".
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        // Open external links (help/docs/credits) in the system browser.
        .plugin(tauri_plugin_opener::init());

    // OS share sheet (sender side of the project share round-trip) — mobile only.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_share::init());

    // The reference Scratch Link, as a selectable connection path. iOS only:
    // it is Swift/CoreBluetooth. Registering it does not change any existing
    // route — nothing reaches it until the user picks that transport.
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_scratchlink_original::init());

    // Pico USB serial state — desktop only (the mobile pico commands are stubs).
    #[cfg(desktop)]
    let builder = builder.manage(pico::PicoSerial(std::sync::Mutex::new(None)));

    builder
        .invoke_handler(tauri::generate_handler![
            fileio::save_project,
            fileio::write_temp_project,
            fileio::is_mobile,
            downloads::download_pack,
            downloads::download_pack_zip,
            downloads::pack_present,
            downloads::remove_pack,
            pico::pico_serial_list,
            pico::pico_serial_open,
            pico::pico_serial_write,
            pico::pico_serial_read,
            pico::pico_serial_close,
            pico::pico_bootsel_volume,
            pico::pico_flash_uf2,
            scratchlink::bridge::scratchlink_bridge_open,
            scratchlink::bridge::scratchlink_bridge_send,
            scratchlink::bridge::scratchlink_bridge_close
        ])
        .manage(scratchlink::bridge::BridgeState::default())
        .setup(|app| {
            // Bring up the local ScratchLink WS server the web VM dials.
            scratchlink::start();

            // Offline asset cache: create the packs dir and serve it locally so
            // the web VM can load cached library media / model weights by URL.
            if let Ok(root) = downloads::packs_root(app.handle()) {
                let _ = std::fs::create_dir_all(&root);
                assetserver::start(root);
            }

            // turbowarp:// deep links → load the referenced project (if any).
            #[cfg(any(target_os = "macos", target_os = "linux", windows))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        if let Ok(path) = url.to_file_path() {
                            fileio::emit_load_project(&handle, &path);
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Brickwright application")
        // Handle files opened via association / share "open with" (macOS/iOS
        // deliver these as an Opened run event with file:// URLs; the variant
        // doesn't exist on Linux/Windows, where deep links cover it instead).
        .run(move |_app, _event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = _event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        fileio::emit_load_project(_app, &path);
                    }
                }
            }
        });
}
