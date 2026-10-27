//! Autosave folder (desktop): Settings > Autosave & history.
//!
//! The web layer keeps every autosave version in its own IndexedDB; this module adds an
//! optional copy in a folder the user chose. As with project documents (fileio.rs), the
//! native folder picker is the only way a path enters: the web layer can ask to choose,
//! show or forget the folder, and hand over bytes plus a bare `.sb3` file name, but it never
//! names a path. Only files this module wrote (the `" autosave "` pattern) are ever pruned.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

const MAX_KEEP: usize = 200;
const MAX_BYTES: usize = 256 * 1024 * 1024;
const MARKER: &str = " autosave ";

fn setting_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("autosave-folder.txt"))
}

fn stored_folder(app: &AppHandle) -> Option<PathBuf> {
    let text = std::fs::read_to_string(setting_file(app).ok()?).ok()?;
    let path = PathBuf::from(text.trim());
    path.is_dir().then_some(path)
}

/// A bare autosave file name: no separators or parent references, `.sb3`, and the marker
/// that lets pruning recognise it.
fn valid_name(filename: &str) -> bool {
    !filename.is_empty()
        && filename.len() <= 160
        && filename.contains(MARKER)
        && filename.ends_with(".sb3")
        && !filename.starts_with('.')
        && !filename
            .chars()
            .any(|c| matches!(c, '/' | '\\' | ':' | '\0') || c.is_control())
}

/// Keep the newest `keep` autosaves that share `filename`'s project prefix.
fn prune(folder: &Path, filename: &str, keep: usize) -> std::io::Result<()> {
    let Some(at) = filename.find(MARKER) else {
        return Ok(());
    };
    let prefix = &filename[..at + MARKER.len()];
    let mut names: Vec<String> = std::fs::read_dir(folder)?
        .flatten()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.starts_with(prefix) && name.ends_with(".sb3"))
        .collect();
    // The suffix is an ISO timestamp, so name order is time order.
    names.sort();
    let excess = names.len().saturating_sub(keep);
    for name in names.into_iter().take(excess) {
        let _ = std::fs::remove_file(folder.join(name));
    }
    Ok(())
}

/// The chosen folder, for display; None when there is none (or it disappeared).
#[tauri::command]
pub fn autosave_folder(app: AppHandle) -> Option<String> {
    stored_folder(&app).map(|path| path.display().to_string())
}

/// Native folder picker. Returns the chosen folder, or None when cancelled.
/// Phones have no folder picker in the dialog plugin; their autosaves stay in the webview.
#[cfg(mobile)]
#[tauri::command]
pub async fn choose_autosave_folder(_app: AppHandle) -> Result<Option<String>, String> {
    Err("choosing an autosave folder is not available on this device".into())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn choose_autosave_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picker = app.clone();
    let picked =
        tauri::async_runtime::spawn_blocking(move || picker.dialog().file().blocking_pick_folder())
            .await
            .map_err(|e| e.to_string())?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let folder = folder.into_path().map_err(|e| e.to_string())?;
    let setting = setting_file(&app)?;
    if let Some(parent) = setting.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&setting, folder.display().to_string()).map_err(|e| e.to_string())?;
    Ok(Some(folder.display().to_string()))
}

#[tauri::command]
pub fn clear_autosave_folder(app: AppHandle) -> Result<(), String> {
    match std::fs::remove_file(setting_file(&app)?) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

/// Write one autosave into the chosen folder and prune that project's older ones.
#[tauri::command]
pub fn write_autosave(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
    keep: usize,
) -> Result<(), String> {
    if !valid_name(&filename) {
        return Err("invalid autosave file name".into());
    }
    if bytes.len() > MAX_BYTES {
        return Err("autosave is too large".into());
    }
    let folder = stored_folder(&app).ok_or("no autosave folder is chosen")?;
    let path = folder.join(&filename);
    let mut temporary = path.as_os_str().to_os_string();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    std::fs::write(&temporary, &bytes)
        .and_then(|_| std::fs::rename(&temporary, &path))
        .map_err(|e| {
            let _ = std::fs::remove_file(&temporary);
            e.to_string()
        })?;
    prune(&folder, &filename, keep.clamp(1, MAX_KEEP)).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_bare_marked_sb3_names_are_written() {
        assert!(valid_name("Robot autosave 2026-10-27T10-00-00.sb3"));
        for bad in [
            "",
            "Robot.sb3",
            "../Robot autosave 1.sb3",
            "a/b autosave 1.sb3",
            "a\\b autosave 1.sb3",
            "C: autosave 1.sb3",
            ".hidden autosave 1.sb3",
            "Robot autosave 1.exe",
        ] {
            assert!(!valid_name(bad), "{bad:?} must be refused");
        }
    }

    #[test]
    fn pruning_keeps_the_newest_of_one_project_only() {
        let dir = std::env::temp_dir().join(format!("bw-autosave-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for name in [
            "A autosave 2026-01-01T00-00-01.sb3",
            "A autosave 2026-01-01T00-00-02.sb3",
            "A autosave 2026-01-01T00-00-03.sb3",
            "B autosave 2026-01-01T00-00-01.sb3",
            "A notes.sb3",
        ] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        prune(&dir, "A autosave 2026-01-01T00-00-03.sb3", 2).unwrap();
        let mut left: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(
            left,
            [
                "A autosave 2026-01-01T00-00-02.sb3",
                "A autosave 2026-01-01T00-00-03.sb3",
                "A notes.sb3",
                "B autosave 2026-01-01T00-00-01.sb3"
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
