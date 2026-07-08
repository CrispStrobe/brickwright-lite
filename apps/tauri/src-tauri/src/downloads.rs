//! On-demand downloads-manager (Option B — see PLAN.md §25).
//!
//! Fetches assets (Scratch library media, ML/TTS model weights) from their
//! origin hosts *to the user's device* and caches them under
//! `<app-data>/packs/<pack>/<name>`. We host and bundle nothing; this is the
//! "we fetch, we don't redistribute" path, matching the runtime GPL extensions.
//! `assetserver.rs` then serves the cache to the web VM.

use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use futures_util::StreamExt;
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

/// Download a single zip pack and extract its files (flattened) into
/// `<packs>/<pack>/`. This is the one-file library path (Option C): one request
/// for the whole CC BY-SA library instead of ~1300. Emits `download-progress`
/// with byte counts as it streams.
#[tauri::command]
pub async fn download_pack_zip(app: AppHandle, pack: String, url: String) -> Result<usize, String> {
    let dir = packs_root(&app)?.join(sanitize(&pack));
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;

    let client = reqwest::Client::builder()
        .user_agent("Brickwright")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let total = resp.content_length().unwrap_or(0) as usize;
    let mut data: Vec<u8> = Vec::with_capacity(total);
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        data.extend_from_slice(&chunk);
        // done == total signals "download complete, extracting" on the UI side.
        emit_progress(&app, &pack, data.len().min(total.max(1)), total.max(1), 0);
    }

    // zip is synchronous — extract off the async runtime.
    let count = tokio::task::spawn_blocking(move || extract_zip_flat(&data, &dir))
        .await
        .map_err(|e| e.to_string())??;
    Ok(count)
}

// Extract every file entry into `dir` by basename only (the pack is flat:
// `<md5ext>` plus LICENSE/CREDITS), guarding against zip-slip via the basename.
fn extract_zip_flat(bytes: &[u8], dir: &Path) -> Result<usize, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if !entry.is_file() {
            continue;
        }
        let name = match entry
            .enclosed_name()
            .and_then(|p| p.file_name().map(|n| n.to_owned()))
        {
            Some(n) => n,
            None => continue,
        };
        let mut buf = Vec::with_capacity(entry.size() as usize);
        if entry.read_to_end(&mut buf).is_err() {
            continue;
        }
        let dest = dir.join(&name);
        let tmp = dir.join(format!("{}.part", name.to_string_lossy()));
        if std::fs::write(&tmp, &buf).is_ok() && std::fs::rename(&tmp, &dest).is_ok() {
            count += 1;
        } else {
            let _ = std::fs::remove_file(&tmp);
        }
    }
    Ok(count)
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
