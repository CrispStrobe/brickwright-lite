# Peer sessions (`peers`): security review

Task E11 of [OPEN-TASKS-2026-09-29.md](OPEN-TASKS-2026-09-29.md), 2026-10-12. Subject: the
`peers` feature of the parked Codex WIP, GitHub branch `wip/codex-parked-main-checkout-20261005`
(commit `23e9c7f44`, base `d7e07b515`). Line numbers below are in that commit (`WIP:`) unless a
path under `apps/` or `overlay/` on main is named.

**Verdict: GO, behind a compile-time gate that is OFF by default, with the fixes F1–F10 applied.**
Nothing in a default build changes: no listener, no peer command, no peer capability, no peer UI,
no peer dialect words. The feature is NOT recommended for default-on until F11 (pairing model and
forward secrecy) is redesigned; that would need a new review.

## 1. What it does

Two Brickwright apps (desktop or phone) on the same local network exchange requests over TCP.

- **Share side.** Settings → *Peer sessions…* → *Start sharing* makes the app listen on TCP
  **20113** and shows a link `bwpeer://<private IPv4>:20113/<43-char base64url secret>`
  (256-bit secret). The link is copied or sent through the share sheet. *Stop sharing* closes
  the listener and forgets the secret. Nothing persists: a restart is "off".
- **Paired side.** The person pastes the link under a name ("Phone", "Robot A"). Buttons and the
  *Peer Sessions* extension's blocks / pseudocode words then send actions to that peer.
- **Actions** (WIP: `apps/tauri/src-tauri/src/peer.rs:197-205`): `ping`, `camera.capture`
  (take a photo with the receiver's camera and return it), `project.offer` / `project.request`
  (send / fetch a whole `.sb3`), `code.offer` / `code.request` (the Code tab's source),
  `project.run` / `project.stop` (green flag / stop on the receiver), `stage.broadcast`,
  `variable.get` / `variable.set` (stage variables), `sprite.get|move|point|size|visible`.
- **Parts:** Rust transport `src-tauri/src/peer.rs` (492 lines) + 5 commands in `lib.rs` /
  `build.rs` / `capabilities/default.json`; GUI client and request handler
  `overlay/scratch-gui/src/lib/peer-sessions.js` (600); VM extension
  `overlay/scratch-vm/src/extensions/crispstrobe/peers/index.js` (182, 48 blocks); dialect
  subclass `overlay/scratch-gui/src/lib/peer-pseudocode.js` (261); settings-menu item;
  extension-library entry; a camera hook in `cameracapture/index.js`; `Info.plist` /
  `Info.ios.plist` strings; Cargo deps `chacha20poly1305`, `hkdf`, `sha2`, `get_if_addrs`, tokio
  `io-util`/`time`; `docs/PEER-SESSIONS.md`; `test/peer-pseudocode.test.mjs` (5 tests).

## 2. Threat model

The users are learners, often children, on **school networks** and **public Wi-Fi / hotspots**:
many devices, unknown owners, client isolation not guaranteed, people on the same network who
are curious or hostile. Assets: the device's **camera** (photos of children and rooms), the
**open project and Code tab** (the learner's work, possibly personal text), the **open
project's runtime** — which can drive **connected robots and motors** (SPIKE, EV3, micro:bit,
Arduino, Pico) — and the app's availability.

Attackers considered:

| who | holds | can |
| --- | --- | --- |
| A1 anyone on the LAN | nothing | connect to 20113, send bytes, sniff and inject traffic |
| A2 someone who got the link | the secret (shoulder-surfed, forwarded chat, synced clipboard) | everything a paired peer can |
| A3 script in the editor realm | `window.__TAURI__` in the main webview (a loaded extension, a pasted project's custom extension, an XSS) | invoke granted commands |
| A4 a paired, misbehaving peer | the secret, legitimately | send any action, often |

Out of scope: a compromised OS; the internet at large (but see F9: the port must not reach it).

## 3. Listener exposure

- **When:** only between *Start sharing* and *Stop sharing* / quit (WIP `peer.rs:109-169`).
  Default build after this change: never (no code).
- **Bind:** `0.0.0.0:20113`, IPv4, every interface (WIP `peer.rs:361`). The link names only
  private addresses (WIP `peer.rs:79-94`), but the socket accepted any source — see F9.
- **Discovery:** none. No mDNS/Bonjour/broadcast; the link is the only way to find a peer. Good:
  nothing advertises the device. (iOS still shows its Local Network prompt on first use.)
- **Concurrency:** 8 connections, excess dropped (WIP `peer.rs:365-377`), each up to 65 s
  (`IO_TIMEOUT`, `peer.rs:23`) — see F5.

## 4. Pairing and authentication

The link is a **bearer secret**: whoever holds it is a peer. There is one secret per sharing
session, shared by every peer; no per-peer identity, no expiry, no revocation short of stopping
sharing (which revokes everyone). The secret travels by clipboard / share sheet, i.e. through
whatever the person uses to send it (F11).

Handshake (WIP `peer.rs:239-300`): client sends `BWPEER01 || client_nonce(32)`, server answers
`server_nonce(32)`; both derive `c2s`/`s2c` = HKDF-SHA256(salt = both nonces, ikm = secret, info
= direction label). There is **no key confirmation**: the server learns whether the client knows
the secret only when the first frame fails to decrypt — after it has already sized and allocated
that frame (F4).

- **MITM (A1 without the link):** cannot derive keys; any tampering fails the AEAD. OK.
- **Replay:** a recorded request replayed to the server meets a fresh `server_nonce`, so a
  different key, and fails. A recorded reply replayed to a client meets a fresh `client_nonce`.
  Reflection fails: direction labels are both in the HKDF info and the AEAD associated data. OK.
- **Forward secrecy:** none. The key schedule is PSK-only, so a link leaked later decrypts every
  recorded session (photos, projects) — F11.

## 5. Crypto

`chacha20poly1305` 0.10 (RustCrypto, MIT OR Apache-2.0; its README records one NCC Group audit with no
significant findings) and `hkdf` 0.12 / `sha2` 0.10 (RustCrypto). Keys: 256-bit secret from
`getrandom`; 256-bit per-connection nonces from `getrandom`. HKDF use matches the crate's
documented API (`Hkdf::new(Some(salt), ikm)`, `expand(info, okm)`).

**Nonce:** every frame is sealed with the constant all-zero 96-bit nonce (WIP `peer.rs:311`,
`peer.rs:348`). ChaCha20-Poly1305's documented requirement is a unique nonce per (key,
message). It holds today only because each connection derives fresh keys and each key seals
exactly ONE message (one request, one reply). Nothing enforces that: the first change that sends
a second frame on a connection reuses (key, nonce), which leaks the XOR of plaintexts and the
Poly1305 key, i.e. allows forgery — F6.

## 6. What a peer can send, and what the receiver does

Receiver path: `serve_one` (WIP `peer.rs:388-463`) decrypts, checks the action name against the
allow-list, emits `bw-peer-request` to the main webview, and waits ≤ 60 s for `peer_reply`.
`handleRequest` (WIP `peer-sessions.js:342-389`) acts:

| action | receiver does (WIP) | consent in WIP | finding |
| --- | --- | --- | --- |
| `ping` | returns project title, camera present | none | info leak of the title: accepted |
| `camera.capture` | loads Camera Capture, starts the camera, takes a JPEG, returns it (`peer-sessions.js:311-340`) | **none** (an indicator only) | **F2** |
| `project.offer` | `window.confirm`, then decode base64, bundle preflight, `vm.loadProject` (`:187-217`) | `window.confirm` | **F1** |
| `project.request` | `window.confirm`, then serialise the project (`:350-355`) | `window.confirm` | **F1** |
| `code.offer` | `window.confirm`, then overwrite `bw-code-autosave` (`:170-185`); code is NOT run | `window.confirm` | **F1** |
| `code.request` | `window.confirm`, then return the Code tab (`:358-363`) | `window.confirm` | **F1** |
| `project.run` | `vm.greenFlag()` (`:364-366`) | **none** | **F3** |
| `project.stop` | `vm.stopAll()` | none | fine: stopping is safe |
| `stage.broadcast`, `variable.*`, `sprite.*` | start hats / set values / move sprites (`:278-309`, `:246-277`) | **none** | **F3** |

Input handling, checked: a received project is bounded (12 MiB decoded, `:8`, `:189`, `:196`)
and goes through the same parser as opening a file — no new parser; nothing on the wire is a
**file path**, so no path traversal, and a received project is detached from the open document
(`clear_project_document`) so Save cannot overwrite the previous file. Photos must be
`data:image/jpeg;base64,` ≤ 14 MiB and ≤ 4 Mpx before decode (`:81-104`, `:130`). Variable values
≤ 4096 chars, numbers finite, sprite/variable/broadcast names 1–100 chars and resolved by lookup
(`:222-309`). The wire is `serde_json` into `Value` only (no typed deserialisation of attacker
data beyond that), bounded by the 24 MiB frame. Received code is stored, never executed.
`peer_reply` and the event are confined to the `main` window. The action allow-list is checked
on both ends (`peer.rs:197-205`, `:209`, `:406`).

## 7. Findings

| # | severity | finding (WIP location) | decision | go/no-go |
| --- | --- | --- | --- | --- |
| F1 | **Critical** | Every consent is `window.confirm(...)` (`peer-sessions.js:176`, `:191`, `:352`, `:360`). In the Tauri app — the only place this runs — the dialog plugin replaces `confirm` with an async function, so the value is an always-truthy Promise (task E6). The four guards **never refuse**: any link holder replaces the open project, fetches it, overwrites and fetches the Code tab without the person answering. | **Fix:** consent moves to the native side: `peer/mod.rs` asks in a native `blocking_show` dialog BEFORE the request is emitted to the editor; the editor half asks nothing (`peer-sessions.js` has no `confirm`, test-held). | GO with fix |
| F2 | **High** | `camera.capture` takes a photo with no per-request consent (`peer-sessions.js:311-340`, `:346`); the only signal is an on-screen badge. A link holder can photograph a child's room at will. | **Fix:** native Allow/Deny for **every** photo. | GO with fix |
| F3 | **High** | `project.run`, `stage.broadcast`, `variable.set`, `sprite.*` act with no consent (`peer-sessions.js:364-385`). A running project can drive motors and robots; a link holder can start one remotely. | **Fix:** one native Allow/Deny per sharing session for remote control (reads included), remembered until sharing stops; a Deny is also remembered (no re-nagging). `project.stop` stays free. | GO with fix |
| F4 | Medium | Pre-authentication allocation: after the unauthenticated handshake the server reads a u32 length and allocates up to 24 MiB (`peer.rs:336-344` via `:400`) before any authentication; 8 slots → ~192 MiB from anyone on the LAN (A1), on phones too. | **Fix:** protocol v2: the client first sends a 16-byte AEAD `hello` tag; the server verifies it before reading any length. An unauthenticated peer costs 8+32+16 bytes. Test `a_stranger_is_refused_before_any_length_is_read`. | GO with fix |
| F5 | Medium | Slot exhaustion: 8 slots, each holdable for 65 s by a connection that sends nothing (`peer.rs:365-383`, `:23`) — A1 blocks legitimate peers indefinitely. | **Fix:** 5 s handshake deadline; separate pools: 8 pre-authentication, 4 authenticated. Residual: a LAN host can still contend for the pre-auth pool — availability only; accepted (any listener has it; *Stop sharing* ends it). | GO with fix |
| F6 | Low (latent High) | Constant all-zero nonce (`peer.rs:311`, `:348`): correct only while each key seals one message; unenforced. | **Fix:** per-direction 64-bit counter nonces that refuse reuse (`Direction`), hello = 0 and request = 1 on `c2s`. Test `nonces_never_repeat_and_a_replayed_frame_is_refused`. | GO with fix |
| F7 | Low | A paired peer (A4) can stack consent dialogs. | **Fix:** one dialog at a time (async mutex); control Deny remembered for the session. | GO with fix |
| F8 | Medium | `peer_enable` needs no user action (`peer.rs:109-155`): script in the editor realm (A3) can open a LAN listener and read the link via `peer_status`, then exfiltrate it. | **Fix:** `peer_enable` asks natively ("Start peer sharing?") before the listener starts; all five commands refuse any window but `main`. Residual: editor script can drive peers the person already paired, like the person's own project can — by design. | GO with fix |
| F9 | Low | Listener accepts any source address on every interface (`peer.rs:361`, `:367`); links may name any IPv4 (`parse_link`, `:64-77`). A laptop with a public address, VPN or hotspot exposes 20113 beyond the LAN. | **Fix:** connections from outside RFC 1918 / loopback / link-local are closed before a byte is read; links must name such an address. Test `only_local_network_addresses_may_connect`. | GO with fix |
| F10 | Low | `get_if_addrs` 0.5 (`Cargo.toml`, used at `peer.rs:80`) is unmaintained (last released 2018; `if-addrs` is its maintained fork). | **Refused.** The link's address comes from the default-route interface via a UDP `connect` (no packet sent), as `share_server.rs` already does; no new crate. | refused (replaced) |
| F11 | Medium (design) | Pairing is a shared bearer link: one secret for every peer, no per-peer identity, no expiry, revocation only by stopping; PSK-only keys, so **no forward secrecy**. | **Accepted only while the feature is gated off.** Before any default-on: ephemeral X25519 (Noise `NNpsk0`/`XXpsk3`), per-peer pairing codes, link expiry. | GO (gated) / NO-GO for default-on |
| F12 | Info | The WIP also added `tauri-plugin-fs` and a vendored dialog patch to the same files. | Not part of `peers`; refused (E4 already decided against both). | refused |
| F13 | Low | `Info.plist` / `Info.ios.plist`: new `NSLocalNetworkUsageDescription`, camera string rewritten to mention peers. | **Refused for default builds:** a store build must not describe a feature it does not carry. A peers-on iOS build must add `NSLocalNetworkUsageDescription` (see §9). | refused (default) |
| F15 | Low | New with F1's native dialog: the peer chooses the project name it shows. Control characters could forge extra lines, and bidi overrides (U+202E, Cf — not caught by `char::is_control`) could reorder the text the person reads. | **Fix:** names are stripped of Cc and of bidi/zero-width format characters and cut to 80 characters (`shown`, `peer/mod.rs`); test `a_peer_chosen_name_cannot_spoof_the_dialog` — whose first CI run caught the U+202E case. | GO with fix |
| F14 | Low | Peer dialect words exist in a Lite subclass of sb3-creator. A received project, once control is allowed, can use the receiver's OWN paired peers (transitive reach); each hop still asks that device's person. | Kept **Lite-only and gated**: no build without the flag may parse them, so nothing goes upstream. | GO (gated) |

Dependencies added (feature `peers` only): `chacha20poly1305` 0.10.1, `hkdf` 0.12.4 and their
RustCrypto dependencies `aead`, `chacha20` 0.9.1, `cipher`, `hmac`, `inout`, `opaque-debug`,
`poly1305`, `universal-hash` — all MIT OR Apache-2.0, actively maintained (newer major lines
0.11 / 0.13 exist; 0.10 / 0.12 are the audited, widely used lines). Recorded in
THIRD-PARTY-NOTICES.md. tokio gains `io-util` and `time` under the feature only.

Tauri permissions: the five commands `peer_status|enable|disable|send|reply`. In the WIP they
were granted to `main` in `capabilities/default.json`. Now they exist in the app manifest only
when Cargo builds the feature (`build.rs`: `CARGO_FEATURE_PEERS`), and are granted by
`runtime-capabilities/peers.json` (main webview only), added at startup by a
`#[cfg(feature = "peers")]` block. No other capability changed.

## 8. The gate (what landed)

| side | switch | default | off means |
| --- | --- | --- | --- |
| app | Cargo feature `peers` (`apps/tauri/src-tauri/Cargo.toml`) — not in any `default` | off | `mod peer` not compiled; 5 commands not registered (`#[cfg(feature = "peers")]` in `generate_handler!`), not in the manifest, no permission exists; `peers.json` never added; no listener; crypto crates not built |
| web | `BW_ENABLE_PEERS=1` → DefinePlugin `process.env.BW_ENABLE_PEERS` = `true` (`overlay/scratch-gui/webpack.config.js`) | off | every consumer tests `=== true`, which webpack folds: no settings item, no library entry, no `peersessions` loader or chunk, no `peer-sessions` chunk, no dialect subclass, no camera hook |

Proofs:

- `test/tauri-app-command-acl.test.mjs` — peer commands only behind the feature, only in
  `PEER_COMMANDS`, in no default capability; `peers.json` exactly the five, main only, added only
  by the gated block (10 new mutations, each red).
- `test/peers-gate.test.mjs` — Cargo feature not default, crypto crates optional, every `peer`
  use in `lib.rs` gated, the listener starts only after the native question; the define line is
  exact with no fallback, no workflow or `vercel-build.sh` turns it on; every flag read is
  `=== true` and every reach of a peer module or marker is behind it (six consumers, listed);
  the default dialect has no peer words; the editor half has no `confirm`; the build scanner's
  own pass/fail cases.
- `scripts/verify-no-peer-surface.mjs` — Build workflow guard on the **emitted** default build:
  no peer marker in any file, and the scan must see the real bundle (≥ 5 scripts, the
  `cameracapture` marker) or it fails rather than passing vacuously. The folding it relies on
  was measured with webpack 5.96.1 (the pinned version) on all five gate shapes (`if`, spread
  object with `import()`, spread array, ternary `require`, `&&`): off build 0 markers, 1 file;
  on build all 4 markers, 2 files.
- `tauri` workflow — `cargo test --features peers peer::` and `cargo clippy --features peers -- -D
  warnings`, so the gated code is compiled, tested and linted on every run without shipping.
  The protocol tests (7) also ran locally in a standalone crate against the same lockfile;
  mutations of the hello check, the nonce counter and the address filter each turned them red.

## 9. Building it on (local, deliberate)

```bash
BW_ENABLE_PEERS=1 bash scripts/vercel-build.sh          # web half
cargo tauri build --features peers                       # app half (both, or neither)
```

For iOS add to `Info.ios.plist`: `NSLocalNetworkUsageDescription` = "Brickwright connects to a
paired Brickwright app on this network only while you share." Each device asks before every
photo or project transfer and once for remote control; *Stop sharing* revokes every link.
