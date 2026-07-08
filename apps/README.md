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
| **BLE** | SPIKE FW3.x, Essential, Boost, Powered-Up, WeDo, Technic, DUPLO, Mario | `tauri-plugin-blec` (btleplug) — all 5 platforms | plugin wired; bridge to WS TODO |
| **BTC/SPP** (Win/Linux/Android) | EV3, legacy-FW SPIKE 2.x | `bluetooth-rust` (WinRT / BlueZ-bluer / Android JNI, SPP UUID `00001101-…`) | TODO |
| **BTC/SPP** (macOS) | EV3, legacy SPIKE 2.x | `objc2` → `IOBluetoothRFCOMMChannel` shim | TODO (only real gap) |
| **BTC/SPP** (iOS) | EV3 (MFi only) | port existing `BTSession.swift` (ExternalAccessory) into a Tauri iOS plugin | parity with current app; Apple-gated regardless |

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
- *Unit* — the BLE codec/parse helpers: `parse_uuid` (full UUID, 16-bit short as hex/`0x`/number, invalid), `decode_message` (base64 / default / missing / bad encoding), `build_scan_filter`.
- *Integration* — spins the ScratchLink WS server on an ephemeral port and drives real JSON-RPC over a socket: `ping`→42, BT-skeleton ack, BLE-without-adapter → graceful JSON-RPC error (no panic), unknown method → error.
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
