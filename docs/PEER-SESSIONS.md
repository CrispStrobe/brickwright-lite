# Peer sessions

Brickwright's native apps can exchange camera photos and projects over an IP
network. The network may be a shared WLAN or an operating-system Bluetooth PAN
(for example, a Mac or Windows computer connected to an iPhone Personal
Hotspot over Bluetooth). Direct app-to-app BLE transport is not implemented.
The browser build cannot host a peer.

## Use

1. On the device that will receive requests, open **Settings → Peer sessions**
   and choose **Start sharing**. Keep the app open and in the foreground when
   using its camera.
2. Copy one of its `bwpeer://` links to the controller. On the controller,
   open **Settings → Peer sessions**, enter a name and the link, then choose
   **Add peer**. The controller verifies the link with an encrypted ping.
   Repeat for each device; every pairing has its own name and secret.
3. Use the panel to take a photo, send or request the complete project, send or
   request only the Code tab, start/stop the peer's project, or send a broadcast. The **Peer
   Sessions** Scratch extension exposes the same actions to blocks.
4. **Stop sharing and revoke link** immediately invalidates the current link.
   Starting again creates a new random secret. The controller's peer list is
   in memory and is cleared when the app closes.

For a robot-mounted iPhone connected over Bluetooth, enable Personal Hotspot
on the iPhone and connect the Mac or Windows controller to it using Bluetooth
networking. [Apple's setup instructions](https://support.apple.com/guide/iphone/share-your-internet-connection-iph45447ca6/27/ios/27)
describe that connection. Start sharing on the iPhone, then transfer its link
to the controller. The app sends the same encrypted IP protocol over that
Bluetooth network. Keep the iPhone app in the foreground for camera requests.

The receiving device asks before opening a project or replacing its Code tab.
The source device asks before answering a request to send its project or code.
Project transfer uses the same Brickwright `.sb3` bundle as Save to Computer,
including Blocks, Code, Circuit, and Widgets content. A peer's project can use
its local hardware extensions. Broadcasts and stage variables let the
controller trigger those hardware blocks after the project is running. The
sender's Scratch project remains separate.

## Use from Blocks

Pair the phone in **Settings → Peer sessions** on the controller first. Give
it a local name, such as `Phone`. Add the **Peer Sessions** extension from the
Blocks extension gallery. A script can then use:

```text
when green flag clicked
select peer [Phone]
take photo on peer
if <(peer photo brightness at x [240] y [180]) < [35]> then
  say [It is dark ahead]
end
```

The photo command waits for the phone's camera response. The photo width,
height, color (`#rrggbb`), and brightness (0–100) reporters read the most
recent received photo. Coordinates start at the top left. Out-of-range pixels
return empty color and zero brightness. **Last peer photo** contains the full
JPEG data URL if another extension needs the image bytes; the panel shows the
image when open. Peer selection stores the local name in a project, never the
secret link. Pair again after restarting the app, since peer links are kept in
memory only.

You can pair several peers in the same controller session. The original
blocks use the selected peer. Named variants take a **peer [PEER]** input and
route each request independently. They cover photos and photo reporters,
code/project transfer, project run/stop, broadcasts, variables, and sprite
controls. Photo data and pixel reporters are kept separately for each peer:

```text
when green flag clicked
set variable [speed] to [50] on peer [Robot A]
broadcast [drive] on peer [Robot A]
set variable [speed] to [30] on peer [Robot B]
broadcast [drive] on peer [Robot B]
take photo on peer [Phone]
```

Independent Scratch scripts can send requests to different peers at the same
time. A named block reports an error if its peer name is not paired.

The extension also has **send project and code**, **send Code tab**, **get
project and code**, **get Code tab**, **run peer project**, and **stop peer
project** blocks. Receiving a project/code offer asks before replacing local
content. A project sent to the phone can use the LEGO or Camera Capture
extensions available on that phone.

## Control a peer's hub or stage

The peer runs its own project and owns its local hub connection. In that
project, create a **for all sprites** variable called `speed` and a broadcast
called `drive`. Connect the hub on the peer, then make a receiver script:

```text
when I receive [drive]
set motor [A] speed to (speed) %
start motor [A]
```

The exact motor blocks depend on the LEGO extension and hub. On the
controller, after pairing and starting the peer project, use:

```text
when green flag clicked
select peer [Robot]
set peer variable [speed] to [50]
broadcast [drive] on peer
```

The broadcast starts the receiver script on the peer; its motor command uses
the peer's hub connection. A peer project can expose additional actions with
more broadcast names and variables, including stopping motors, steering,
playing sounds, and taking sensor readings. Stage variables must already
exist in the peer project. A peer variable reporter reads the current value.

For direct stage steering, the extension also has **move peer sprite**,
**point peer sprite**, **set peer sprite size**, **show/hide peer sprite**,
and **peer sprite x/y** blocks. Sprite names must exist in the peer project.
The move block uses Scratch stage coordinates, with the center at `(0, 0)`.
The peer project may also animate its sprites in response to broadcasts.

## Use from pseudocode

In the Code tab's **Pseudocode** mode, compile this with **To Blocks** and then
run the blocks in the native app:

```text
WHEN flag clicked:
  select peer "Phone"
  IF peer selected? THEN:
    take photo on peer
    set light to peer photo brightness at 240, 180
    IF light < 35 THEN:
      say "It is dark ahead"
    set sample to peer photo color at 240, 180
```

The Code tab also understands `selected peer`, `last peer photo`, `peer photo
width`, and `peer photo height`. Its peer commands are `send project to peer`,
`send code to peer`, `get project from peer`, `get code from peer`, `run peer
project`, and `stop peer project`. **From Blocks** prints these phrases again.
These commands execute in the Scratch VM on the controller; exporting the
program as on-device Python, C, or firmware cannot make a bare hub perform a
phone camera request.

Motor and stage commands use the same peer from pseudocode:

```text
WHEN flag clicked:
  select peer "Robot"
  run peer project
  set peer variable "speed" to 50
  broadcast "drive" on peer
  move peer sprite "Robot" to x 80 y -30
  point peer sprite "Robot" in direction 45
  set x to peer sprite "Robot" x
  set measured speed to peer variable "speed"
```

Other accepted phrases are `set peer sprite "Robot" size to 120%`, `show
peer sprite "Robot"`, `hide peer sprite "Robot"`, and `peer sprite "Robot"
y`. Compile with **To Blocks**; **From Blocks** restores the phrases.

For multiple peers, name each destination in the command. This leaves the
selected peer alone:

```text
WHEN flag clicked:
  IF peer "Robot A" paired? THEN:
    set variable "speed" to 50 on peer "Robot A"
    broadcast "drive" on peer "Robot A"
  IF peer "Robot B" paired? THEN:
    set variable "speed" to 30 on peer "Robot B"
    broadcast "drive" on peer "Robot B"
  take photo on peer "Phone"
  set light to photo brightness from peer "Phone" at 240, 180
```

Named forms also cover `run project on peer "Robot A"`, `move sprite
"Bot" on peer "Robot A" to x 80 y 0`, and `variable "speed" on peer
"Robot A"`. Each peer needs its own running app and sharing link.

## Security and limits

The share link contains a 256-bit random secret. It is the authority to request
camera captures, send code/projects, run/stop the target's project, change its
stage sprites and variables, and trigger any project script listening for a
broadcast. A peer project can use a broadcast to command motors and other
attached hardware.
Treat it as a password and send it only to a trusted peer. Each TCP connection
uses two random handshake nonces, HKDF-SHA-256 directional keys, and
ChaCha20-Poly1305 authenticated encryption. Cleartext peer requests and photos
are never sent on the network. Messages are versioned and action names are
allowlisted. Stopping sharing closes the listener. While running, it limits
active connections to eight, encrypted frames to 24 MiB, and times out requests.
The UI caps projects at 12 MiB and photos at 14 million data-URL characters.

This is a session grant, not a six-digit PIN. A short numeric code alone is
not used as a bearer credential. There is no cloud relay, persistent peer
identity, device discovery, live project merge, or direct BLE peer transport.
The current protocol is independent of ScratchLink, which remains bound to
`127.0.0.1` for hub communication.

## Why the LEGO BLE path is separate

The native LEGO extensions use `scratchlink/ble.rs` through
`tauri-plugin-blec` and btleplug. That path is a **BLE central**: it scans for a
hub acting as a GATT peripheral, connects, and reads or writes the hub's
characteristics. The plugin's handler stores one connected peripheral and one
set of characteristics. Using that handler to connect to a Brickwright peer
would interfere with the same session's LEGO hub connection.

Direct app-to-app BLE requires an additional transport. The receiving iPhone
would need to advertise a dedicated GATT service using CoreBluetooth's
`CBPeripheralManager`, while a controller would need an independent BLE central
connection that can coexist with the hub connection. Android hosting would
need its own GATT server and advertiser. The transport would need chunking,
flow control, cancellation, and a complete encrypted request/response before
it could carry photos or `.sb3` projects. It must use the same peer secret,
action allowlist, and revocation rules as the IP route. The current BLE plugin
does not provide the peripheral/server half of that design.

Bluetooth PAN is the supported Bluetooth path for the full project and photo
payloads today. A short control-only GATT route would not satisfy project and
photo transfer, and it could disconnect the LEGO hub if it reused the existing
single-connection handler.
