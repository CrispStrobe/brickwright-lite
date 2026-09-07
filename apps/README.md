# Brickwright native apps

Native wrappers around the `brickwright-lite` web build (`packages/scratch-gui/build`).

## Why one Tauri project (not apps/desktop + apps/mobile)

The original plan split desktop and mobile because it assumed two frameworks
(Electron + Capacitor). **Tauri 2 unifies them:** a single project in
[`tauri/`](./tauri) builds **all five targets** — macOS, Windows, Linux, iOS,
Android — from one `src-tauri`. Mobile targets are generated *into* that project
with `tauri ios init` / `tauri android init`; there is no second app to maintain.

```
apps/
  tauri/                 # the one native app, all platforms
    package.json         # @tauri-apps/cli; scripts: dev, build, ios:*, android:*
    src-tauri/
      tauri.conf.json    # frontendDist → ../../../packages/scratch-gui/build
      Cargo.toml         # tauri, tauri-plugin-blec, tokio, tokio-tungstenite
      capabilities/      # permission set (core + blec)
      icons/             # generated from packages/.../build/static/images/512.png
      src/
        main.rs          # desktop entry → lib::run()
        lib.rs           # mobile_entry_point + Tauri builder (blec plugin + ScratchLink)
        scratchlink/     # local ScratchLink WS server (ws://127.0.0.1:20111)
```

## The native ScratchLink

The web VM (`scratch-vm/src/io/{bt,ble}.js`) already dials
`ws://127.0.0.1:20111/scratch/{bt,ble}`. `src/scratchlink/` runs that WS server
natively, so the **unmodified** web build connects with no inject script on
desktop. Message surface: BT = `discover`/`connect`/`send` + `didReceiveMessage`
(base64 byte stream); BLE = GATT `discover`/`connect`/`write`/`read`/`startNotifications`.

### Transport status

| Transport | Hardware | Backend | Status |
|-----------|----------|---------|--------|
| **BLE** | SPIKE FW3.x, Essential, Boost, Powered-Up, WeDo, Technic, DUPLO, Mario | `tauri-plugin-blec`/btleplug plus the local ScratchLink bridge | Implemented; hardware permission and radio behavior still require per-platform integration runs |
| **BTC/SPP — Windows** | EV3, legacy-FW SPIKE 2.x | WinRT RFCOMM | Implemented for already-paired devices |
| **BTC/SPP — Linux** | EV3, legacy-FW SPIKE 2.x | BlueZ through `bluer` | Implemented |
| **BTC/SPP — Android** | EV3, legacy-FW SPIKE 2.x | `android.bluetooth` through JNI | Implemented for bonded devices; real-device runtime validation remains |
| **BTC/SPP — macOS** | EV3, legacy-FW SPIKE 2.x | Objective-C `IOBluetoothRFCOMMChannel` shim | Implemented |
| **BTC/SPP — iOS** | MFi-authorized EV3 accessories | ExternalAccessory Objective-C shim | Implemented, subject to Apple's MFi and prior-pairing restrictions |

Only **EV3** and **legacy-firmware (2.x) SPIKE Prime / Robot Inventor** need BTC;
everything modern is BLE.

## Develop

```bash
cd apps/tauri
npm install
npm run dev              # desktop dev window (macOS/Win/Linux)
npm run build            # desktop bundle
npm run android:init && npm run android:dev   # Android (needs Android SDK/NDK)
npm run ios:init && npm run ios:dev           # iOS (needs Xcode)
```

The frontend is the prebuilt web bundle; rebuild it from the repo root
(`npm run build:gui`) before packaging if the web app changed.

## Testing

**Automated (no hardware) — `cargo test` under `apps/tauri/src-tauri`, also run in CI (`.github/workflows/tauri.yml`):**
- *Unit* — BLE parsing, filtering, authorization, blocklist, encoding and session-state behavior.
- *Integration* — drives the ScratchLink WebSocket and in-process native bridge, including request/reply correlation, lifecycle cleanup, malformed requests, and unavailable-adapter errors.
- *Parity gates* — verify the BLE method surface and each platform-specific Classic backend against the shared ScratchLink contract.
- CI also runs `cargo clippy -- -D warnings`.

**Live, no LEGO hub:**
- *Real-Bluetooth scan* — build the `.app` (`npm run build -- --debug --bundles app`), launch it, then over `ws://127.0.0.1:20111/scratch/ble` send an unfiltered `discover` (`{"filters":[]}`); nearby BLE devices should stream back as `didDiscoverPeripheral`. Validates the scan→notify path through real CoreBluetooth. Needs the bundle (a raw binary can't get macOS BT permission).
- *Editor renders* — launch the app and confirm the scratch-gui editor loads from `frontendDist` and the VM reaches the local ScratchLink.

**Live, with a hub (manual checklist):**
1. Power a hub (Boost / WeDo 2.0 / SPIKE FW3.x); in the editor add the matching extension.
2. Discover → the hub appears in the peripheral picker.
3. Connect → status goes green (`connect` + `discover_services` succeed).
4. Read → a battery/sensor `read` returns a value.
5. Write → a motor block spins a motor (`write` → `send_data`).
6. Notifications → sensor blocks update live (`startNotifications` → `characteristicDidChange`).
