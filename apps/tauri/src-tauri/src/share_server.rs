//! Explicit, time-bounded LAN transfer for one selected export. There is no
//! directory listing, upload route, app-data root, or stable URL.

use serde::Serialize;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream, UdpSocket},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

struct Running {
    stop: Arc<AtomicBool>,
    url: String,
    expires_at: u64,
}

#[derive(Default)]
pub struct ShareServerState(Mutex<Option<Running>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareServerInfo {
    active: bool,
    url: Option<String>,
    expires_at: Option<u64>,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|socket| {
            socket.connect("192.0.2.1:9")?;
            socket.local_addr().map(|address| address.ip().to_string())
        })
        .unwrap_or_else(|_| "127.0.0.1".into())
}

fn response(mut stream: TcpStream, status: &str, headers: &[(&str, String)], body: &[u8]) {
    let mut head = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
}

fn serve(mut stream: TcpStream, expected_path: &str, file: &Path, filename: &str) {
    let mut request = [0_u8; 8192];
    let count = stream.read(&mut request).unwrap_or(0);
    let first = String::from_utf8_lossy(&request[..count])
        .lines()
        .next()
        .unwrap_or("")
        .to_string();
    if first != format!("GET {expected_path} HTTP/1.1") {
        response(
            stream,
            "404 Not Found",
            &[("Content-Type", "text/plain".into())],
            b"Not found\n",
        );
        return;
    }
    match std::fs::read(file) {
        Ok(bytes) => response(
            stream,
            "200 OK",
            &[
                ("Content-Type", "application/octet-stream".into()),
                (
                    "Content-Disposition",
                    format!("attachment; filename=\"{}\"", filename.replace('"', "")),
                ),
                ("Cache-Control", "no-store".into()),
                ("X-Content-Type-Options", "nosniff".into()),
            ],
            &bytes,
        ),
        Err(_) => response(
            stream,
            "410 Gone",
            &[("Content-Type", "text/plain".into())],
            b"Share expired\n",
        ),
    }
}

#[tauri::command]
pub fn start_share_server(
    state: tauri::State<'_, ShareServerState>,
    path: String,
    minutes: u32,
) -> Result<ShareServerInfo, String> {
    let file = PathBuf::from(path);
    if !file.is_file() {
        return Err("share file does not exist".into());
    }
    let filename = file
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or("brickwright-export")
        .to_string();
    let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = Uuid::new_v4().simple().to_string();
    let route = format!("/{token}/{filename}");
    let expires_at = now() + u64::from(minutes.clamp(1, 30)) * 60;
    let url = format!("http://{}:{port}{route}", local_ip());
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let thread_route = route.clone();
    thread::spawn(move || {
        while !thread_stop.load(Ordering::Relaxed) && now() < expires_at {
            match listener.accept() {
                Ok((stream, _)) => serve(stream, &thread_route, &file, &filename),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50))
                }
                Err(_) => break,
            }
        }
    });
    let mut guard = state.0.lock().map_err(|_| "share server state poisoned")?;
    if let Some(previous) = guard.take() {
        previous.stop.store(true, Ordering::Relaxed);
    }
    *guard = Some(Running {
        stop,
        url: url.clone(),
        expires_at,
    });
    Ok(ShareServerInfo {
        active: true,
        url: Some(url),
        expires_at: Some(expires_at),
    })
}

#[tauri::command]
pub fn stop_share_server(state: tauri::State<'_, ShareServerState>) -> Result<(), String> {
    if let Some(running) = state
        .0
        .lock()
        .map_err(|_| "share server state poisoned")?
        .take()
    {
        running.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn share_server_status(
    state: tauri::State<'_, ShareServerState>,
) -> Result<ShareServerInfo, String> {
    let mut guard = state.0.lock().map_err(|_| "share server state poisoned")?;
    if guard
        .as_ref()
        .is_some_and(|running| running.expires_at <= now())
    {
        if let Some(expired) = guard.take() {
            expired.stop.store(true, Ordering::Relaxed);
        }
    }
    Ok(match guard.as_ref() {
        Some(running) => ShareServerInfo {
            active: true,
            url: Some(running.url.clone()),
            expires_at: Some(running.expires_at),
        },
        None => ShareServerInfo {
            active: false,
            url: None,
            expires_at: None,
        },
    })
}
