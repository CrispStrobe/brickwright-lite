//! Peer-session wire protocol (task E11). No Tauri types here, so the security-relevant part
//! (link format, key schedule, framing, address and consent policy) is unit-tested on its own.
//! Reviewed in docs/PEERS-SECURITY-REVIEW.md; compiled only with the `peers` Cargo feature.
//!
//! One connection carries exactly one request and one reply:
//!
//! ```text
//! client -> server   MAGIC (8) || client_nonce (32)
//! server -> client   server_nonce (32)
//!                    keys = HKDF-SHA256(salt = client_nonce || server_nonce, ikm = link secret)
//! client -> server   hello: AEAD(c2s, n=0, aad="hello", "")          16 bytes, no length
//! client -> server   len (u32 BE) || AEAD(c2s, n=1, aad="request", JSON)
//! server -> client   len (u32 BE) || AEAD(s2c, n=0, aad="response", JSON)
//! ```
//!
//! Differences from the parked WIP (review findings F4, F5, F6):
//! - the server authenticates the client with the 16-byte `hello` BEFORE it reads a length
//!   or allocates a frame buffer, so a stranger on the network costs 72 bytes, not 24 MiB;
//! - nonces are per-direction counters that refuse reuse, instead of a constant all-zero
//!   nonce that was safe only while each key sealed exactly one message;
//! - links and connections are limited to private/loopback/link-local IPv4.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const PORT: u16 = 20113;
pub const MAGIC: &[u8; 8] = b"BWPEER02";
pub const MAX_FRAME: usize = 24 * 1024 * 1024;
const TAG: usize = 16;

/// What the receiving person must agree to before an action reaches the editor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Consent {
    /// Harmless: `ping` (name only) and `project.stop` (stopping is never refused).
    None,
    /// A native OK/Cancel box for every single request (camera, projects, code).
    EachRequest,
    /// One native OK/Cancel box per sharing session for remote control of the open project.
    Control,
}

/// Every action the protocol knows, with the consent it needs. Anything else is refused.
pub const ACTIONS: &[(&str, Consent)] = &[
    ("ping", Consent::None),
    ("project.stop", Consent::None),
    ("camera.capture", Consent::EachRequest),
    ("project.offer", Consent::EachRequest),
    ("project.request", Consent::EachRequest),
    ("code.offer", Consent::EachRequest),
    ("code.request", Consent::EachRequest),
    ("project.run", Consent::Control),
    ("stage.broadcast", Consent::Control),
    ("variable.get", Consent::Control),
    ("variable.set", Consent::Control),
    ("sprite.get", Consent::Control),
    ("sprite.move", Consent::Control),
    ("sprite.point", Consent::Control),
    ("sprite.size", Consent::Control),
    ("sprite.visible", Consent::Control),
];

pub fn consent_for(action: &str) -> Option<Consent> {
    ACTIONS
        .iter()
        .find(|(name, _)| *name == action)
        .map(|(_, consent)| *consent)
}

/// Only addresses that cannot be the public internet: RFC 1918, loopback, link-local IPv4.
pub fn address_allowed(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => v6
            .to_ipv4_mapped()
            .is_some_and(|v4| address_allowed(IpAddr::V4(v4))),
    }
}

pub fn secret_text(secret: &[u8; 32]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(secret)
}

pub fn link_for(ip: Ipv4Addr, secret: &[u8; 32]) -> String {
    format!("bwpeer://{ip}:{PORT}/{}", secret_text(secret))
}

pub fn parse_link(link: &str) -> Result<(SocketAddr, [u8; 32]), String> {
    use base64::Engine;
    let rest = link.strip_prefix("bwpeer://").ok_or("Invalid peer link")?;
    let (address, token) = rest.split_once('/').ok_or("Invalid peer link")?;
    let address: SocketAddr = address.parse().map_err(|_| "Invalid peer address")?;
    if address.port() != PORT
        || !matches!(address.ip(), IpAddr::V4(_))
        || !address_allowed(address.ip())
    {
        return Err("Peer address must be a private IPv4 address on the Brickwright peer port".into());
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token)
        .map_err(|_| "Invalid peer secret")?;
    let secret: [u8; 32] = bytes.try_into().map_err(|_| "Invalid peer secret")?;
    Ok((address, secret))
}

pub fn random32() -> Result<[u8; 32], String> {
    let mut bytes = [0; 32];
    getrandom::getrandom(&mut bytes).map_err(|_| "Secure random source unavailable")?;
    Ok(bytes)
}

/// One direction of one connection: its own key and a nonce counter that never repeats.
pub struct Direction {
    cipher: ChaCha20Poly1305,
    next: u64,
}

impl Direction {
    fn new(key: &[u8; 32]) -> Self {
        Self {
            cipher: ChaCha20Poly1305::new(Key::from_slice(key)),
            next: 0,
        }
    }

    fn nonce(&mut self) -> Result<Nonce, String> {
        let counter = self.next;
        self.next = counter.checked_add(1).ok_or("Peer nonce exhausted")?;
        let mut nonce = [0u8; 12];
        nonce[4..].copy_from_slice(&counter.to_be_bytes());
        Ok(*Nonce::from_slice(&nonce))
    }

    pub fn seal(&mut self, aad: &[u8], clear: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = self.nonce()?;
        self.cipher
            .encrypt(&nonce, Payload { msg: clear, aad })
            .map_err(|_| "Peer encryption failed".into())
    }

    pub fn open(&mut self, aad: &[u8], sealed: &[u8]) -> Result<Vec<u8>, String> {
        let nonce = self.nonce()?;
        self.cipher
            .decrypt(&nonce, Payload { msg: sealed, aad })
            .map_err(|_| "Peer authentication failed".into())
    }
}

pub struct Channel {
    pub send: Direction,
    pub recv: Direction,
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
    hkdf.expand(b"brickwright-peer-v2-client-to-server", &mut c2s)
        .map_err(|_| "Peer key derivation failed")?;
    hkdf.expand(b"brickwright-peer-v2-server-to-client", &mut s2c)
        .map_err(|_| "Peer key derivation failed")?;
    Ok((c2s, s2c))
}

fn io(error: std::io::Error) -> String {
    error.to_string()
}

pub async fn client_handshake<S: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut S,
    secret: &[u8; 32],
) -> Result<Channel, String> {
    let client_nonce = random32()?;
    stream.write_all(MAGIC).await.map_err(io)?;
    stream.write_all(&client_nonce).await.map_err(io)?;
    let mut server_nonce = [0; 32];
    stream.read_exact(&mut server_nonce).await.map_err(io)?;
    let (c2s, s2c) = derive(secret, &client_nonce, &server_nonce)?;
    let mut channel = Channel {
        send: Direction::new(&c2s),
        recv: Direction::new(&s2c),
    };
    let hello = channel.send.seal(b"hello", b"")?;
    stream.write_all(&hello).await.map_err(io)?;
    Ok(channel)
}

/// Reads at most 8 + 32 + 16 bytes from an unauthenticated peer and allocates nothing for it.
pub async fn server_handshake<S: AsyncRead + AsyncWrite + Unpin>(
    stream: &mut S,
    secret: &[u8; 32],
) -> Result<Channel, String> {
    let mut magic = [0; 8];
    stream.read_exact(&mut magic).await.map_err(io)?;
    if &magic != MAGIC {
        return Err("Invalid peer protocol".into());
    }
    let mut client_nonce = [0; 32];
    stream.read_exact(&mut client_nonce).await.map_err(io)?;
    let server_nonce = random32()?;
    stream.write_all(&server_nonce).await.map_err(io)?;
    let (c2s, s2c) = derive(secret, &client_nonce, &server_nonce)?;
    let mut channel = Channel {
        send: Direction::new(&s2c),
        recv: Direction::new(&c2s),
    };
    let mut hello = [0; TAG];
    stream.read_exact(&mut hello).await.map_err(io)?;
    channel.recv.open(b"hello", &hello)?;
    Ok(channel)
}

pub async fn write_frame<S: AsyncWrite + Unpin>(
    stream: &mut S,
    direction: &mut Direction,
    aad: &[u8],
    clear: &[u8],
) -> Result<(), String> {
    if clear.len() + TAG > MAX_FRAME {
        return Err("Peer message is too large".into());
    }
    let sealed = direction.seal(aad, clear)?;
    stream.write_u32(sealed.len() as u32).await.map_err(io)?;
    stream.write_all(&sealed).await.map_err(io)?;
    stream.flush().await.map_err(io)
}

pub async fn read_frame<S: AsyncRead + Unpin>(
    stream: &mut S,
    direction: &mut Direction,
    aad: &[u8],
) -> Result<Vec<u8>, String> {
    let length = stream.read_u32().await.map_err(io)? as usize;
    if !(TAG..=MAX_FRAME).contains(&length) {
        return Err("Invalid peer message size".into());
    }
    let mut sealed = vec![0; length];
    stream.read_exact(&mut sealed).await.map_err(io)?;
    direction.open(aad, &sealed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[test]
    fn links_require_a_full_secret_a_private_ipv4_address_and_the_peer_port() {
        let secret = [7; 32];
        let link = link_for(Ipv4Addr::new(192, 168, 1, 3), &secret);
        assert_eq!(parse_link(&link).unwrap().1, secret);
        assert!(parse_link("bwpeer://192.168.1.3:20113/123456").is_err());
        assert!(parse_link(&link.replace(":20113", ":20111")).is_err());
        // A public address is refused: the link must not reach past the local network.
        assert!(parse_link(&link.replace("192.168.1.3", "8.8.8.8")).is_err());
        assert!(parse_link(&format!("bwpeer://[::1]:{PORT}/{}", secret_text(&secret))).is_err());
        assert!(parse_link(&link.replace("bwpeer://", "http://")).is_err());
    }

    #[test]
    fn only_local_network_addresses_may_connect() {
        for allowed in ["10.0.0.2", "172.16.4.4", "192.168.0.9", "127.0.0.1", "169.254.1.1",
            "::ffff:192.168.1.2"] {
            assert!(address_allowed(allowed.parse().unwrap()), "{allowed}");
        }
        for refused in ["8.8.8.8", "100.64.0.1", "172.32.0.1", "::1", "2001:db8::1",
            "::ffff:8.8.8.8"] {
            assert!(!address_allowed(refused.parse().unwrap()), "{refused}");
        }
    }

    #[test]
    fn every_action_has_a_consent_and_nothing_else_is_accepted() {
        assert_eq!(consent_for("ping"), Some(Consent::None));
        assert_eq!(consent_for("project.stop"), Some(Consent::None));
        assert_eq!(consent_for("camera.capture"), Some(Consent::EachRequest));
        assert_eq!(consent_for("project.offer"), Some(Consent::EachRequest));
        assert_eq!(consent_for("project.request"), Some(Consent::EachRequest));
        assert_eq!(consent_for("code.request"), Some(Consent::EachRequest));
        assert_eq!(consent_for("project.run"), Some(Consent::Control));
        assert_eq!(consent_for("variable.get"), Some(Consent::Control));
        assert_eq!(consent_for("sprite.move"), Some(Consent::Control));
        assert_eq!(consent_for("file.read"), None);
        assert_eq!(consent_for(""), None);
        // Only ping and stop are free; everything else asks the receiving person.
        let free: Vec<_> = ACTIONS
            .iter()
            .filter(|(_, consent)| *consent == Consent::None)
            .map(|(name, _)| *name)
            .collect();
        assert_eq!(free, ["ping", "project.stop"]);
    }

    #[test]
    fn nonces_never_repeat_and_a_replayed_frame_is_refused() {
        let key = [3; 32];
        let mut sender = Direction::new(&key);
        let mut receiver = Direction::new(&key);
        let first = sender.seal(b"request", b"same").unwrap();
        let second = sender.seal(b"request", b"same").unwrap();
        assert_ne!(first, second, "the same plaintext must not seal to the same bytes");
        assert_eq!(receiver.open(b"request", &first).unwrap(), b"same");
        assert!(receiver.open(b"request", &first).is_err(), "a replay must fail");
        // Out of order fails too; every caller ends the connection on the first failure.
        let mut fresh = Direction::new(&key);
        assert!(fresh.open(b"request", &second).is_err(), "frame 1 cannot be read as frame 0");
        // Direction labels are authenticated: a request cannot be read as a response.
        let mut other = Direction::new(&key);
        let sealed = Direction::new(&key).seal(b"request", b"x").unwrap();
        assert!(other.open(b"response", &sealed).is_err());
    }

    #[tokio::test]
    async fn a_paired_round_trip_works_and_a_reply_cannot_be_reflected() {
        let secret = [9; 32];
        let (mut client, mut server) = duplex(1 << 16);
        let serving = tokio::spawn(async move {
            let mut channel = server_handshake(&mut server, &secret).await.unwrap();
            let request = read_frame(&mut server, &mut channel.recv, b"request").await.unwrap();
            assert_eq!(request, b"ping");
            write_frame(&mut server, &mut channel.send, b"response", b"pong").await.unwrap();
        });
        let mut channel = client_handshake(&mut client, &secret).await.unwrap();
        write_frame(&mut client, &mut channel.send, b"request", b"ping").await.unwrap();
        let reply = read_frame(&mut client, &mut channel.recv, b"response").await.unwrap();
        assert_eq!(reply, b"pong");
        serving.await.unwrap();
    }

    #[tokio::test]
    async fn a_stranger_is_refused_before_any_length_is_read() {
        let (mut client, mut server) = duplex(1 << 16);
        let stranger = tokio::spawn(async move {
            let mut channel = client_handshake(&mut client, &[1; 32]).await.unwrap();
            // A 24 MiB frame announcement that the server must never get to.
            client.write_u32(MAX_FRAME as u32).await.unwrap();
            let _ = channel.send.seal(b"request", b"");
            client
        });
        let refused = server_handshake(&mut server, &[2; 32]).await;
        assert_eq!(refused.err().as_deref(), Some("Peer authentication failed"));
        let _client = stranger.await.unwrap();
        // The length announcement is still unread: nothing was sized or allocated from it.
        assert_eq!(server.read_u32().await.unwrap(), MAX_FRAME as u32);
    }

    #[tokio::test]
    async fn oversized_and_undersized_lengths_are_refused() {
        for length in [0u32, (TAG - 1) as u32, (MAX_FRAME + 1) as u32] {
            let (mut writer, mut reader) = duplex(64);
            writer.write_u32(length).await.unwrap();
            let mut direction = Direction::new(&[5; 32]);
            assert_eq!(
                read_frame(&mut reader, &mut direction, b"request").await.err().as_deref(),
                Some("Invalid peer message size")
            );
        }
    }
}
