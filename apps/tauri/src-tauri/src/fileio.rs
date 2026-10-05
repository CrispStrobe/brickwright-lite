//! Provider-aware project documents. The OS picker grants access; the app keeps
//! only the currently opened handle and remembers desktop paths for Recents.

use std::{
    io::{Cursor, Read, Write},
    path::Path,
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FilePath, FsExt, OpenOptions};

#[derive(Clone)]
struct CurrentDocument {
    path: FilePath,
    digest: String,
    rememberable: bool,
    format_sb3: bool,
}

#[derive(Default)]
pub struct Documents {
    current: Mutex<Option<CurrentDocument>>,
    candidate: Mutex<Option<CurrentDocument>>,
    pending: Mutex<Option<LoadPayload>>,
}

#[derive(Clone, Serialize)]
pub struct LoadPayload {
    name: String,
    bytes: Vec<u8>,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    saved: bool,
    conflict: bool,
    name: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct RecentDocument {
    name: String,
    path: String,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn read_bytes(app: &AppHandle, path: &FilePath) -> Result<Vec<u8>, String> {
    let result = app.fs().read(path.clone()).map_err(|e| e.to_string());
    #[cfg(target_os = "ios")]
    let _ = app
        .fs()
        .stop_accessing_security_scoped_resource(path.clone());
    result
}

fn name(path: &FilePath) -> String {
    match path {
        FilePath::Path(path) => path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project.sb3")
            .to_string(),
        FilePath::Url(url) if url.scheme() == "content" => url
            .path_segments()
            .and_then(|mut s| s.next_back())
            .filter(|s| s.ends_with(".sb3") || s.ends_with(".sb2"))
            .map(|s| s.replace("%20", " "))
            .unwrap_or_else(|| "project.sb3".to_string()),
        FilePath::Url(url) => url
            .path_segments()
            .and_then(|mut s| s.next_back())
            .map(|s| s.replace("%20", " "))
            .unwrap_or_else(|| "project.sb3".to_string()),
    }
}

fn is_scratch2(bytes: &[u8]) -> bool {
    let Ok(mut archive) = zip::ZipArchive::new(Cursor::new(bytes)) else {
        return false;
    };
    let Ok(mut project) = archive.by_name("project.json") else {
        return false;
    };
    if project.size() > 64 * 1024 * 1024 {
        return false;
    }
    let mut text = String::new();
    if project.read_to_string(&mut text).is_err() {
        return false;
    }
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    json.get("children").is_some() && json.get("targets").is_none()
}

fn recent_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("recent-projects.json"))
}

fn read_recents(app: &AppHandle) -> Vec<RecentDocument> {
    recent_file(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice::<Vec<RecentDocument>>(&b).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(|r| {
            (cfg!(target_os = "android") && r.path.starts_with("content://"))
                || Path::new(&r.path).is_file()
        })
        .collect()
}

fn remember(app: &AppHandle, path: &FilePath) {
    // iOS document URLs require bookmarks across relaunch. Android's patched
    // document picker retains the URI grant for paths marked rememberable.
    if cfg!(target_os = "ios") {
        return;
    }
    let path_string = path.to_string();
    let mut recents = read_recents(app);
    recents.retain(|r| r.path != path_string);
    recents.insert(
        0,
        RecentDocument {
            name: name(path),
            path: path_string,
        },
    );
    recents.truncate(12);
    if let Ok(file) = recent_file(app) {
        if let Ok(data) = serde_json::to_vec(&recents) {
            let _ = std::fs::write(file, data);
        }
    }
}

fn read_document(
    app: &AppHandle,
    path: FilePath,
    rememberable: bool,
) -> Result<LoadPayload, String> {
    let bytes = read_bytes(app, &path)?;
    let mut label = name(&path);
    // Some Android providers expose only an opaque document ID. Identify an
    // older Scratch 2 archive so Save creates .sb3 rather than replacing it.
    if label == "project.sb3"
        && matches!(&path, FilePath::Url(url) if url.scheme() == "content")
        && is_scratch2(&bytes)
    {
        label = "project.sb2".to_string();
    }
    if !label.to_ascii_lowercase().ends_with(".sb3")
        && !label.to_ascii_lowercase().ends_with(".sb2")
    {
        return Err("Choose a .sb3 or .sb2 project".into());
    }
    *app.state::<Documents>()
        .candidate
        .lock()
        .map_err(|e| e.to_string())? = Some(CurrentDocument {
        path: path.clone(),
        digest: digest(&bytes),
        rememberable,
        format_sb3: label.to_ascii_lowercase().ends_with(".sb3"),
    });
    Ok(LoadPayload {
        name: label,
        bytes,
        path: path.to_string(),
    })
}

#[tauri::command]
pub fn open_project_document(app: AppHandle) -> Result<Option<LoadPayload>, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Scratch project", &["sb3", "sb2"])
        .blocking_pick_file();
    picked
        .map(|path| read_document(&app, path, true))
        .transpose()
}

#[tauri::command]
pub fn open_recent_project(app: AppHandle, path: String) -> Result<LoadPayload, String> {
    if !read_recents(&app).iter().any(|r| r.path == path) {
        return Err("This project is not in Recent Projects".into());
    }
    let path = path.parse::<FilePath>().map_err(|e| e.to_string())?;
    read_document(&app, path, true)
}

#[tauri::command]
pub fn recent_projects(app: AppHandle) -> Vec<RecentDocument> {
    read_recents(&app)
}

#[tauri::command]
pub fn pending_project(app: AppHandle) -> Option<LoadPayload> {
    app.state::<Documents>().pending.lock().ok()?.take()
}

#[tauri::command]
pub fn clear_project_document(app: AppHandle) {
    if let Ok(mut current) = app.state::<Documents>().current.lock() {
        *current = None;
    }
    if let Ok(mut candidate) = app.state::<Documents>().candidate.lock() {
        *candidate = None;
    }
    if let Ok(mut pending) = app.state::<Documents>().pending.lock() {
        *pending = None;
    }
}

#[tauri::command]
pub fn activate_project_document(app: AppHandle, path: String) -> Result<(), String> {
    let candidate = app
        .state::<Documents>()
        .candidate
        .lock()
        .map_err(|e| e.to_string())?
        .take();
    let Some(candidate) = candidate else {
        return Err("No opened project to activate".into());
    };
    if candidate.path.to_string() != path {
        return Err("Opened project changed while loading".into());
    }
    if candidate.rememberable {
        remember(&app, &candidate.path);
    }
    *app.state::<Documents>()
        .current
        .lock()
        .map_err(|e| e.to_string())? = Some(candidate);
    Ok(())
}

#[tauri::command]
pub fn discard_open_project(app: AppHandle) {
    if let Ok(mut candidate) = app.state::<Documents>().candidate.lock() {
        *candidate = None;
    }
}

fn write_document(app: &AppHandle, path: &FilePath, bytes: &[u8]) -> Result<(), String> {
    // Back up the previous document in private app storage before replacing a
    // provider file, where rename/atomic writes may not be available.
    if let Ok(previous) = read_bytes(app, path) {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("project-versions");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let backup = dir.join(format!(
            "{}-{}.sb3",
            chrono_stamp(),
            &digest(&previous)[..12]
        ));
        std::fs::write(backup, previous).map_err(|e| e.to_string())?;
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut files: Vec<_> = entries
                .flatten()
                .filter_map(|e| {
                    e.metadata()
                        .ok()
                        .and_then(|m| m.modified().ok().map(|time| (time, e.path())))
                })
                .collect();
            files.sort_by_key(|(time, _)| *time);
            let excess = files.len().saturating_sub(10);
            for (_, old) in files.into_iter().take(excess) {
                let _ = std::fs::remove_file(old);
            }
        }
    }
    if let Some(local) = path.as_path().filter(|p| !p.is_symlink()) {
        let temporary = local.with_extension(format!("sb3.{}.tmp", chrono_stamp()));
        std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
        match std::fs::rename(&temporary, local) {
            Ok(()) => return Ok(()),
            Err(_) => {
                // Windows cannot rename over every existing file; preserve
                // the backup above and use a direct write in that case.
                let _ = std::fs::remove_file(&temporary);
            }
        }
    }
    let mut options = OpenOptions::new();
    options.write(true).truncate(true).create(true);
    let mut file = app
        .fs()
        .open(path.clone(), options)
        .map_err(|e| e.to_string())?;
    let result = file
        .write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string());
    drop(file);
    #[cfg(target_os = "ios")]
    let _ = app
        .fs()
        .stop_accessing_security_scoped_resource(path.clone());
    result
}

fn chrono_stamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

/// mode: save, saveAs, or copy. A copy does not change the active document.
#[tauri::command]
pub fn save_project_document(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
    mode: String,
) -> Result<SaveResult, String> {
    if !filename.to_ascii_lowercase().ends_with(".sb3") {
        return Err("Project must be .sb3".into());
    }
    let current = app
        .state::<Documents>()
        .current
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    let path = if mode == "save" {
        current
            .as_ref()
            .filter(|c| c.format_sb3)
            .map(|c| c.path.clone())
    } else {
        None
    };
    if let (Some(path), Some(current)) = (&path, &current) {
        let on_disk = read_bytes(&app, path)?;
        if digest(&on_disk) != current.digest {
            return Ok(SaveResult {
                saved: false,
                conflict: true,
                name: Some(name(path)),
            });
        }
    }
    let saving_existing = path.is_some();
    let path = match path {
        Some(path) => path,
        None => match app
            .dialog()
            .file()
            .set_file_name(&filename)
            .add_filter("Scratch project", &["sb3"])
            .blocking_save_file()
        {
            Some(path) => path,
            None => {
                return Ok(SaveResult {
                    saved: false,
                    conflict: false,
                    name: None,
                })
            }
        },
    };
    if mode == "copy"
        && current
            .as_ref()
            .is_some_and(|c| c.path.to_string() == path.to_string())
    {
        return Err("Choose a different location or filename for the copy".into());
    }
    write_document(&app, &path, &bytes)?;
    if mode != "copy" {
        let rememberable = if saving_existing {
            current.as_ref().map_or(true, |c| c.rememberable)
        } else {
            true
        };
        *app.state::<Documents>()
            .current
            .lock()
            .map_err(|e| e.to_string())? = Some(CurrentDocument {
            path: path.clone(),
            digest: digest(&bytes),
            rememberable,
            format_sb3: true,
        });
        if rememberable {
            remember(&app, &path);
        }
    }
    Ok(SaveResult {
        saved: true,
        conflict: false,
        name: Some(name(&path)),
    })
}

#[tauri::command]
pub fn is_mobile() -> bool {
    cfg!(mobile)
}

/// Generic asset export used by the existing download helper.
#[tauri::command]
pub fn save_project(app: AppHandle, filename: String, bytes: Vec<u8>) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();
    let Some(path) = picked else { return Ok(false) };
    let mut options = OpenOptions::new();
    options.write(true).truncate(true).create(true);
    let mut file = app
        .fs()
        .open(path.clone(), options)
        .map_err(|e| e.to_string())?;
    let result = file
        .write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string());
    drop(file);
    #[cfg(target_os = "ios")]
    let _ = app.fs().stop_accessing_security_scoped_resource(path);
    result?;
    Ok(true)
}

#[tauri::command]
pub fn write_temp_project(
    app: AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project.sb3");
    let path = dir.join(name);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn emit_load_project(app: &AppHandle, path: FilePath) {
    match read_document(app, path, !cfg!(target_os = "android")) {
        Ok(payload) => {
            if let Ok(mut pending) = app.state::<Documents>().pending.lock() {
                *pending = Some(payload.clone());
            }
            let _ = app.emit("load-project", payload);
        }
        Err(e) => log::warn!("[fileio] failed to open project: {e}"),
    }
}
