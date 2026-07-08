//! Native project file I/O: a Save-As command the web app calls in place of a
//! browser download, and a helper to push an opened `.sb3` into the web VM
//! (for file-association / share "open with" launches).
//!
//! The web build exposes `window.vm`, so the JS side just calls
//! `window.vm.loadProject(buffer)` when it receives the `load-project` event,
//! and routes `download-blob` through `save_project` when running under Tauri.

use std::path::Path;

use tauri::{AppHandle, Emitter};
use tauri_plugin_dialog::DialogExt;

/// Show a native Save dialog defaulting to `filename` and write `bytes` there.
/// Returns Ok(true) if saved, Ok(false) if the user cancelled.
#[tauri::command]
pub fn save_project(app: AppHandle, filename: String, bytes: Vec<u8>) -> Result<bool, String> {
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("sb3")
        .to_string();
    let picked = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("Scratch project", &[ext.as_str()])
        .blocking_save_file();

    let Some(path) = picked else { return Ok(false) };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    log::info!("[fileio] saved {} ({} bytes)", path.display(), bytes.len());
    Ok(true)
}

#[derive(Clone, serde::Serialize)]
struct LoadPayload {
    name: String,
    bytes: Vec<u8>,
}

/// Read an `.sb3`/`.sb2` at `path` and emit it to the web VM as `load-project`.
/// Used for file-association and share "open with" launches.
pub fn emit_load_project(app: &AppHandle, path: &Path) {
    match std::fs::read(path) {
        Ok(bytes) => {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("project.sb3")
                .to_string();
            log::info!("[fileio] opening {} ({} bytes)", name, bytes.len());
            let _ = app.emit("load-project", LoadPayload { name, bytes });
        }
        Err(e) => log::warn!("[fileio] failed to read {}: {e}", path.display()),
    }
}
