//! Tiny local static-file HTTP server for the offline asset cache.
//!
//! The downloads-manager (`downloads.rs`) fetches library media / model weights
//! from their origin CDNs to `<app-data>/packs/<pack>/<name>` (Option B — we
//! host and bundle nothing; see PLAN.md §25). This server exposes that cache to
//! the web VM so scratch-storage can load a cached asset by URL:
//!
//!   GET http://127.0.0.1:20112/library/<md5>.<ext>  ->  the cached bytes
//!
//! It is deliberately minimal: GET only, no ranges, path-traversal-guarded,
//! and `Access-Control-Allow-Origin: *` so the webview (a different origin —
//! tauri://localhost / http://tauri.localhost) may fetch cross-origin.

use std::path::{Component, Path, PathBuf};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub const ASSET_SERVER_ADDR: &str = "127.0.0.1:20112";

/// Spawn the static server rooted at `root` (the packs directory). Non-blocking.
pub fn start(root: PathBuf) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(root).await {
            log::error!("[assetserver] server exited: {e}");
        }
    });
}

async fn serve(root: PathBuf) -> std::io::Result<()> {
    let listener = TcpListener::bind(ASSET_SERVER_ADDR).await?;
    log::info!(
        "[assetserver] serving {} on http://{ASSET_SERVER_ADDR}/",
        root.display()
    );
    loop {
        let (stream, _) = listener.accept().await?;
        let root = root.clone();
        tokio::spawn(async move {
            if let Err(e) = handle(stream, root).await {
                log::debug!("[assetserver] connection error: {e}");
            }
        });
    }
}

async fn handle(mut stream: TcpStream, root: PathBuf) -> std::io::Result<()> {
    // Read up to the end of the request headers (we only need the request line).
    let mut buf = Vec::with_capacity(1024);
    let mut tmp = [0u8; 1024];
    loop {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 8192 {
            break;
        }
    }

    let head = String::from_utf8_lossy(&buf);
    let mut parts = head.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("/");

    if method != "GET" && method != "HEAD" {
        return write_response(&mut stream, 405, "text/plain", b"method not allowed", false).await;
    }

    // Strip query string; library/model names are hex+ext so no percent-decode.
    let rel = raw_path.split('?').next().unwrap_or("").trim_start_matches('/');
    if let Some(path) = safe_join(&root, rel) {
        if let Ok(bytes) = tokio::fs::read(&path).await {
            let ct = content_type(&path);
            let head_only = method == "HEAD";
            return write_response(&mut stream, 200, ct, &bytes, head_only).await;
        }
    }
    write_response(&mut stream, 404, "text/plain", b"not found", false).await
}

/// Join `rel` under `root`, rejecting empty paths and any `..`/absolute
/// component so a request can never escape the packs directory.
fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
    if rel.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(rel);
    if candidate
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return None;
    }
    Some(root.join(candidate))
}

fn content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "OK",
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Cache-Control: max-age=31536000\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    if !head_only {
        stream.write_all(body).await?;
    }
    stream.flush().await
}
