//! Brickwright native app (Tauri 2) — shared entry point for desktop and mobile.

mod fileio;
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
        // Native Save/Open dialogs, and deep links / .sb3 "open with".
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![fileio::save_project])
        .setup(|app| {
            // Bring up the local ScratchLink WS server the web VM dials.
            scratchlink::start();

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
        // deliver these as an Opened run event with file:// URLs).
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        fileio::emit_load_project(app, &path);
                    }
                }
            }
        });
}
