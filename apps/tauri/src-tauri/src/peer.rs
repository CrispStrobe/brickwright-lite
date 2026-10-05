//! Opt-in peer transport. A share link carries a 256-bit secret; every request and
//! response is authenticated and encrypted before it crosses the WLAN.
//! This is deliberately separate from the loopback-only ScratchLink endpoint.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use hkdf::Hkdf;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Sha256;
use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, State, WebviewWindow};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Semaphore};

const PORT: u16 = 20113;
const MAGIC: &[u8; 8] = b"BWPEER01";
const MAX_FRAME: usize = 24 * 1024 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(65);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
struct Inner {
    secret: Option<[u8; 32]>,
    listener: Option<tauri::async_runtime::JoinHandle<()>>,
    starting: bool,
    generation: u64,
    next_id: u64,
    pending: HashMap<u64, oneshot::Sender<Result<Value, String>>>,
}

#[derive(Clone, Default)]
pub struct PeerState(Arc<Mutex<Inner>>);

#[derive(Serialize)]
pub struct PeerStatus {
    enabled: bool,
    links: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct WireRequest {
    version: u8,
    action: String,
    payload: Value,
}

#[derive(Serialize, Deserialize)]
struct WireReply {
    ok: bool,
    payload: Option<Value>,
    error: Option<String>,
}

fn secret_text(secret: &[u8; 32]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(secret)
}

fn parse_link(link: &str) -> Result<(SocketAddr, [u8; 32]), String> {
    use base64::Engine;
    let rest = link.strip_prefix("bwpeer://").ok_or("Invalid peer link")?;
    let (address, token) = rest.split_once('/').ok_or("Invalid peer link")?;
    let address: SocketAddr = address.parse().map_err(|_| "Invalid peer address")?;
    if address.port() != PORT || !matches!(address.ip(), IpAddr::V4(_)) {
        return Err("Peer address must be an IPv4 address on the Brickwright peer port".into());
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| "Invalid peer secret")?;
    let secret: [u8; 32] = bytes.try_into().map_err(|_| "Invalid peer secret")?;
    Ok((address, secret))
}

fn links(secret: &[u8; 32]) -> Vec<String> {
    let mut addresses: Vec<Ipv4Addr> = get_if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|iface| match iface.ip() {
            IpAddr::V4(ip) if ip.is_private() => Some(ip),
            _ => None,
        })
        .collect();
    addresses.sort();
    addresses.dedup();
    addresses
        .into_iter()
        .map(|ip| format!("bwpeer://{ip}:{PORT}/{}", secret_text(secret)))
        .collect()
}

fn status(inner: &Inner) -> PeerStatus {
    PeerStatus {
        enabled: inner.secret.is_some(),
        links: inner.secret.as_ref().map(links).unwrap_or_default(),
    }
}

#[tauri::command]
pub fn peer_status(state: State<'_, PeerState>) -> Result<PeerStatus, String> {
    let inner = state.0.lock().map_err(|_| "Peer service unavailable")?;
    Ok(status(&inner))
}

#[tauri::command]
pub async fn peer_enable(
    app: tauri::AppHandle,
    state: State<'_, PeerState>,
) -> Result<PeerStatus, String> {
    let peer_state = state.inner().clone();
    let (needs_start, generation) = {
        let mut inner = peer_state
            .0
            .lock()
            .map_err(|_| "Peer service unavailable")?;
        if inner.starting {
            return Err("Peer service is starting; try again".into());
        }
        if inner.listener.is_none() {
            inner.starting = true;
            (true, inner.generation)
        } else {
            (false, inner.generation)
        }
    };
    if needs_start {
        let started = start(app, peer_state.clone()).await;
        let mut inner = peer_state
            .0
            .lock()
            .map_err(|_| "Peer service unavailable")?;
        inner.starting = false;
        if inner.generation != generation {
            if let Ok(listener) = started {
                listener.abort();
            }
            return Err("Peer sharing was stopped while starting".into());
        }
        inner.listener = Some(started?);
    }
    let mut inner = peer_state
        .0
        .lock()
        .map_err(|_| "Peer service unavailable")?;
    if inner.secret.is_none() {
        let mut secret = [0; 32];
        getrandom::getrandom(&mut secret).map_err(|_| "Secure random source unavailable")?;
        inner.secret = Some(secret);
    }
    Ok(status(&inner))
}

#[tauri::command]
pub fn peer_disable(state: State<'_, PeerState>) -> Result<(), String> {
    let mut inner = state.0.lock().map_err(|_| "Peer service unavailable")?;
    inner.secret = None;
    inner.generation = inner.generation.wrapping_add(1);
    if let Some(listener) = inner.listener.take() {
        listener.abort();
    }
    for (_, sender) in inner.pending.drain() {
        let _ = sender.send(Err("Peer sharing stopped".into()));
    }
    Ok(())
}

#[tauri::command]
pub fn peer_reply(
    window: WebviewWindow,
    state: State<'_, PeerState>,
    id: u64,
    payload: Option<Value>,
    error: Option<String>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Peer reply refused".into());
    }
    let sender = state
        .0
        .lock()
        .map_err(|_| "Peer service unavailable")?
        .pending
        .remove(&id)
        .ok_or("Peer request expired")?;
    let result = match error {
        Some(message) => Err(message.chars().take(500).collect()),
        None => Ok(payload.unwrap_or(Value::Null)),
    };
    let _ = sender.send(result);
    Ok(())
}

fn validate_action(action: &str) -> Result<(), String> {
    match action {
        "ping" | "camera.capture" | "project.offer" | "project.request" | "code.offer"
        | "code.request" | "project.run" | "project.stop" | "stage.broadcast" | "variable.get"
        | "variable.set" | "sprite.get" | "sprite.move" | "sprite.point" | "sprite.size"
        | "sprite.visible" => Ok(()),
        _ => Err("Unknown peer action".into()),
    }
}

#[tauri::command]
pub async fn peer_send(link: String, action: String, payload: Value) -> Result<Value, String> {
    validate_action(&action)?;
    let (address, secret) = parse_link(&link)?;
    let request = WireRequest {
        version: 1,
        action,
        payload,
    };
    let bytes = serde_json::to_vec(&request).map_err(|_| "Invalid peer request")?;
    if bytes.len() > MAX_FRAME - 16 {
        return Err("Peer request is too large".into());
    }
    tokio::time::timeout(IO_TIMEOUT, async move {
        let mut stream = TcpStream::connect(address)
            .await
            .map_err(|e| e.to_string())?;
        let (out_key, in_key) = client_handshake(&mut stream, &secret).await?;
        write_frame(&mut stream, &out_key, b"request", &bytes).await?;
        let response = read_frame(&mut stream, &in_key, b"response").await?;
        let reply: WireReply =
            serde_json::from_slice(&response).map_err(|_| "Invalid peer reply")?;
        if reply.ok {
            Ok(reply.payload.unwrap_or(Value::Null))
        } else {
            Err(reply.error.unwrap_or_else(|| "Peer request failed".into()))
        }
    })
    .await
    .map_err(|_| "Peer request timed out".to_owned())?
}

fn derive(
    secret: &[u8; 32],
    client_nonce: &[u8; 32],
    server_nonce: &[u8; 32],
) -> Result<([u8; 32], [u8; 32]), String> {
    let mut salt = [0; 64];
    salt[..32].copy_from_slice(client_nonce);
    salt[32..].copy_from_slice(server_nonce);
    let hkdf = Hkdf::<Sha256>::new(Some(&salt), secret);
    let mut c2s = [0; 32];
    let mut s2c = [0; 32];
    hkdf.expand(b"brickwright-peer-v1-client-to-server", &mut c2s)
        .map_err(|_| "Peer key derivation failed")?;
    hkdf.expand(b"brickwright-peer-v1-server-to-client", &mut s2c)
        .map_err(|_| "Peer key derivation failed")?;
    Ok((c2s, s2c))
}

async fn client_handshake(
    stream: &mut TcpStream,
    secret: &[u8; 32],
) -> Result<([u8; 32], [u8; 32]), String> {
    let mut client_nonce = [0; 32];
    getrandom::getrandom(&mut client_nonce).map_err(|_| "Secure random source unavailable")?;
    stream.write_all(MAGIC).await.map_err(|e| e.to_string())?;
    stream
        .write_all(&client_nonce)
        .await
        .map_err(|e| e.to_string())?;
    let mut server_nonce = [0; 32];
    stream
        .read_exact(&mut server_nonce)
        .await
        .map_err(|e| e.to_string())?;
    derive(secret, &client_nonce, &server_nonce)
}

async fn server_handshake(
    stream: &mut TcpStream,
    secret: &[u8; 32],
) -> Result<([u8; 32], [u8; 32]), String> {
    let mut magic = [0; 8];
    stream
        .read_exact(&mut magic)
        .await
        .map_err(|e| e.to_string())?;
    if &magic != MAGIC {
        return Err("Invalid peer protocol".into());
    }
    let mut client_nonce = [0; 32];
    stream
        .read_exact(&mut client_nonce)
        .await
        .map_err(|e| e.to_string())?;
    let mut server_nonce = [0; 32];
    getrandom::getrandom(&mut server_nonce).map_err(|_| "Secure random source unavailable")?;
    stream
        .write_all(&server_nonce)
        .await
        .map_err(|e| e.to_string())?;
    derive(secret, &client_nonce, &server_nonce)
}

async fn write_frame(
    stream: &mut TcpStream,
    key: &[u8; 32],
    direction: &[u8],
    clear: &[u8],
) -> Result<(), String> {
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(|_| "Invalid peer key")?;
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&[0; 12]),
            Payload {
                msg: clear,
                aad: direction,
            },
        )
        .map_err(|_| "Peer encryption failed")?;
    if encrypted.len() > MAX_FRAME {
        return Err("Peer message is too large".into());
    }
    stream
        .write_u32(encrypted.len() as u32)
        .await
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&encrypted)
        .await
        .map_err(|e| e.to_string())
}

async fn read_frame(
    stream: &mut TcpStream,
    key: &[u8; 32],
    direction: &[u8],
) -> Result<Vec<u8>, String> {
    let length = stream.read_u32().await.map_err(|e| e.to_string())? as usize;
    if !(16..=MAX_FRAME).contains(&length) {
        return Err("Invalid peer message size".into());
    }
    let mut encrypted = vec![0; length];
    stream
        .read_exact(&mut encrypted)
        .await
        .map_err(|e| e.to_string())?;
    let cipher = ChaCha20Poly1305::new_from_slice(key).map_err(|_| "Invalid peer key")?;
    cipher
        .decrypt(
            Nonce::from_slice(&[0; 12]),
            Payload {
                msg: &encrypted,
                aad: direction,
            },
        )
        .map_err(|_| "Peer authentication failed".into())
}

async fn start(
    app: tauri::AppHandle,
    state: PeerState,
) -> Result<tauri::async_runtime::JoinHandle<()>, String> {
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, PORT))
        .await
        .map_err(|e| format!("Peer service could not listen: {e}"))?;
    Ok(tauri::async_runtime::spawn(async move {
        let capacity = Arc::new(Semaphore::new(8));
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(value) => value,
                Err(error) => {
                    log::warn!("peer accept failed: {error}");
                    continue;
                }
            };
            let permit = match capacity.clone().try_acquire_owned() {
                Ok(permit) => permit,
                Err(_) => continue,
            };
            let app = app.clone();
            let state = state.clone();
            tauri::async_runtime::spawn(async move {
                let _permit = permit;
                let _ = tokio::time::timeout(IO_TIMEOUT, serve_one(stream, app, state)).await;
            });
        }
    }))
}

async fn serve_one(
    mut stream: TcpStream,
    app: tauri::AppHandle,
    state: PeerState,
) -> Result<(), String> {
    let secret = state
        .0
        .lock()
        .map_err(|_| "Peer service unavailable")?
        .secret
        .ok_or("Peer sharing is off")?;
    let (in_key, out_key) = server_handshake(&mut stream, &secret).await?;
    let clear = read_frame(&mut stream, &in_key, b"request").await?;
    let request: WireRequest =
        serde_json::from_slice(&clear).map_err(|_| "Invalid peer request")?;
    if request.version != 1 {
        return Err("Unsupported peer protocol".into());
    }
    validate_action(&request.action)?;
    // Revocation during the handshake must invalidate this request too.
    let (id, receiver) = {
        let mut inner = state.0.lock().map_err(|_| "Peer service unavailable")?;
        if inner.secret != Some(secret) {
            return Err("Peer sharing stopped".into());
        }
        inner.next_id = inner.next_id.wrapping_add(1);
        let id = inner.next_id;
        let (sender, receiver) = oneshot::channel();
        inner.pending.insert(id, sender);
        (id, receiver)
    };
    if app
        .emit_to(
            "main",
            "bw-peer-request",
            serde_json::json!({
                "id": id, "action": request.action, "payload": request.payload
            }),
        )
        .is_err()
    {
        state
            .0
            .lock()
            .map_err(|_| "Peer service unavailable")?
            .pending
            .remove(&id);
        return Err("Peer application unavailable".into());
    }
    let result = tokio::time::timeout(REQUEST_TIMEOUT, receiver).await;
    state
        .0
        .lock()
        .map_err(|_| "Peer service unavailable")?
        .pending
        .remove(&id);
    let reply = match result {
        Ok(Ok(Ok(payload))) => WireReply {
            ok: true,
            payload: Some(payload),
            error: None,
        },
        Ok(Ok(Err(error))) => WireReply {
            ok: false,
            payload: None,
            error: Some(error),
        },
        _ => WireReply {
            ok: false,
            payload: None,
            error: Some("Peer request timed out".into()),
        },
    };
    let bytes = serde_json::to_vec(&reply).map_err(|_| "Invalid peer reply")?;
    write_frame(&mut stream, &out_key, b"response", &bytes).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_require_a_full_secret_and_peer_port() {
        let secret = [7; 32];
        let link = format!("bwpeer://192.168.1.3:{PORT}/{}", secret_text(&secret));
        assert_eq!(parse_link(&link).unwrap().1, secret);
        assert!(parse_link("bwpeer://192.168.1.3:20113/123456").is_err());
        assert!(parse_link(&link.replace(":20113", ":20111")).is_err());
    }

    #[tokio::test]
    async fn encrypted_frames_reject_a_different_key() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let writer = tokio::spawn(async move {
            let mut stream = TcpStream::connect(address).await.unwrap();
            write_frame(&mut stream, &[1; 32], b"request", b"private photo")
                .await
                .unwrap();
        });
        let (mut stream, _) = listener.accept().await.unwrap();
        assert!(read_frame(&mut stream, &[2; 32], b"request").await.is_err());
        writer.await.unwrap();
    }
}
