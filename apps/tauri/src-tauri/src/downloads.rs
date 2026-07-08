//! On-demand downloads-manager (Option B — see PLAN.md §25).
//!
//! Fetches assets (Scratch library media, ML/TTS model weights) from their
//! origin hosts *to the user's device* and caches them under
//! `<app-data>/packs/<pack>/<name>`. We host and bundle nothing; this is the
//! "we fetch, we don't redistribute" path, matching the runtime GPL extensions.
//! `assetserver.rs` then serves the cache to the web VM.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// The packs root: `<app-data>/packs`. Also the asset server's document root.
pub fn packs_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packs"))
}

#[derive(Deserialize)]
pub struct DownloadItem {
    /// Origin URL to fetch from (e.g. an assets.scratch.mit.edu asset URL).
    url: String,
    /// Filename to cache as, relative to the pack dir (e.g. `<md5>.<ext>`).
    name: String,
}

#[derive(Clone, Serialize)]
struct Progress {
    pack: String,
    done: usize,
    total: usize,
    failed: usize,
}

/// Download every item into `<packs>/<pack>/`, skipping ones already present.
/// Individual failures are logged and counted, not fatal. Emits a
/// `download-progress` event after each item so the UI can show a bar.
#[tauri::command]
pub async fn download_pack(
    app: AppHandle,
    pack: String,
    items: Vec<DownloadItem>,
) -> Result<usize, String> {
    let dir = packs_root(&app)?.join(sanitize(&pack));
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("Brickwright")
        .build()
        .map_err(|e| e.to_string())?;

    let total = items.len();
    let mut done = 0usize;
    let mut failed = 0usize;

    for item in items {
        let name = sanitize(&item.name);
        if name.is_empty() {
            failed += 1;
            done += 1;
            emit_progress(&app, &pack, done, total, failed);
            continue;
        }
        let dest = dir.join(&name);
        if tokio::fs::try_exists(&dest).await.unwrap_or(false) {
            done += 1;
            emit_progress(&app, &pack, done, total, failed);
            continue;
        }

        match fetch(&client, &item.url).await {
            Ok(bytes) => {
                // Write to a temp file then rename, so a crash mid-download can't
                // leave a truncated asset that the cache would treat as valid.
                let tmp = dir.join(format!("{name}.part"));
                if let Err(e) = tokio::fs::write(&tmp, &bytes).await {
                    log::warn!("[downloads] write {name}: {e}");
                    failed += 1;
                } else if let Err(e) = tokio::fs::rename(&tmp, &dest).await {
                    log::warn!("[downloads] rename {name}: {e}");
                    let _ = tokio::fs::remove_file(&tmp).await;
                    failed += 1;
                }
            }
            Err(e) => {
                log::warn!("[downloads] fetch {}: {e}", item.url);
                failed += 1;
            }
        }
        done += 1;
        emit_progress(&app, &pack, done, total, failed);
    }

    Ok(total - failed)
}

/// Names currently cached in `<packs>/<pack>/` (excludes in-progress `.part`).
#[tauri::command]
pub async fn pack_present(app: AppHandle, pack: String) -> Result<Vec<String>, String> {
    let dir = packs_root(&app)?.join(sanitize(&pack));
    let mut names = Vec::new();
    if let Ok(mut rd) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            if let Some(n) = entry.file_name().to_str() {
                if !n.ends_with(".part") {
                    names.push(n.to_string());
                }
            }
        }
    }
    Ok(names)
}

/// Delete a whole pack to reclaim space.
#[tauri::command]
pub async fn remove_pack(app: AppHandle, pack: String) -> Result<(), String> {
    let dir = packs_root(&app)?.join(sanitize(&pack));
    let _ = tokio::fs::remove_dir_all(&dir).await;
    Ok(())
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

fn emit_progress(app: &AppHandle, pack: &str, done: usize, total: usize, failed: usize) {
    let _ = app.emit(
        "download-progress",
        Progress {
            pack: pack.to_string(),
            done,
            total,
            failed,
        },
    );
}

/// Keep a pack/name to a single safe path segment (no separators, no `..`), so
/// a caller can't write outside its pack dir.
fn sanitize(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect::<String>()
        .trim_matches('.')
        .to_string()
}
