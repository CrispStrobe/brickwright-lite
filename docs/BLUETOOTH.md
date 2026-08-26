# Bluetooth in the app — how it actually connects

*Written 2026-08-26, after "nothing happens with the LEGO Boost extension, on none of
the three paths, on iOS".*

## The finding

It was never an iOS entitlement or Info.plist problem. `Info.ios.plist` has carried
`NSBluetoothAlwaysUsageDescription`, `NSBluetoothPeripheralUsageDescription` and the
`CoreBluetooth` framework all along, and `.github/workflows/mobile.yml` fails the build if
any of them goes missing from the produced app. Three separate defects, all of them silent:

| # | Path (`set connection to …`) | What it did | Why nothing happened |
|---|---|---|---|
| 1 | **`ble`** — the default | `navigator.bluetooth.requestDevice` | **No webview we ship on implements Web Bluetooth.** WKWebView (iOS *and* macOS) never has; WebKitGTK does not; WebView2 keeps it behind a flag. The call threw `undefined is not an object` inside the extension's own `try/catch` and logged to a console that does not exist on a phone. |
| 2 | **`scratchlink`** | `wss://device-manager.scratch.mit.edu:20110/scratch/ble` | That is **legacy** Scratch Link, which nothing in the app listens on — the app's own service is `ws://127.0.0.1:20111`. And the flow read `.peripheralId` off `discover`'s reply, which is `null`: Scratch Link streams what it finds as `didDiscoverPeripheral` notifications. Broken even against a real Scratch Link. |
| 3 | **`bridge`** | a user-supplied `ws://` URL | Works as designed; it needs a bridge server the user runs. Untouched. |

A fourth, underneath all of them: on Apple platforms btleplug's `start_scan` against a
central that is **not powered on** is a silent no-op — CoreBluetooth logs "API MISUSE" to
the device console and returns nothing. So "Bluetooth is switched off" and "no hub in
range" produced byte-identical behaviour: a 15-second wait and then "no device found".

## What the transport looks like now

```
  extension (navigator.bluetooth)          extension ("scratchlink")      stock Scratch ext
            │                                       │                        (io/ble.js)
   native-web-bluetooth.js  ─────┐                  │                            │
            │                    │                  │                            │
   native-ble.js  ──────────►  ws://127.0.0.1:20111/scratch/ble  ◄────────────────┘
                                       │
                          scratchlink/ble.rs  →  tauri-plugin-blec  →  btleplug
                                       │                                    │
                          scratchlink/ble_state.rs  →  ble_apple.m  →  CoreBluetooth
```

- **`overlay/scratch-gui/src/lib/native-web-bluetooth.js`** implements the slice of Web
  Bluetooth the extensions use (`requestDevice` + a device chooser, GATT server/service/
  characteristic, notifications, read/write) on top of the app's own Scratch-Link service.
  It installs **only** when Web Bluetooth is genuinely absent *and* `window.__TAURI__`
  exists — a real implementation always wins, and a browser has no local server to talk to.
  Every gallery extension written against Web Bluetooth gains the app for free.
- **`native-ble.js`** is the one shared JSON-RPC session. One radio, one connected
  peripheral on the native side; a second session would only fight the first.
- **`ble.rs`** gained two methods that are **not** Scratch Link's: `getStatus` (adapter
  permission + power) and `getServices` (enumeration, for `getPrimaryServices()`). A stock
  Scratch Link answers both with method-not-found, which the web side treats as a missing
  feature and not a failure.
- **`ble_state.rs` + `ble_apple.m`** read `CBManager.authorization` (a class property — no
  central created, no prompt) and a silent probe central's `state`. `requestDevice` asks
  before it scans and refuses with the reason, so the powered-off case is now a sentence
  rather than a timeout.
- A failed scan sends **two** notifications: `discoverDidFail` (ours, carries the reason)
  and `userDidNotPickPeripheral` (Scratch Link's, which the stock `io/ble.js` maps to
  `PERIPHERAL_SCAN_TIMEOUT`) — so stock extensions stop waiting out their own timeout too.
- `didDiscoverPeripheral` is now **deduplicated**. blec re-reports every peripheral on each
  200 ms poll, so a 15-second scan announced one hub ~75 times; the outbound channel holds
  64 frames and drops on overflow, so the flood could evict a real reply.

## Reading what happened, on the device

There is no console on iOS, and attaching Safari's Web Inspector is not something a
classroom can do. So **Settings › Connection diagnostics…** opens an in-app panel
(`ble-diagnostics.js`) that carries:

- the environment (native app? Web Bluetooth present, shimmed, or absent? origin?),
- every `console.*` call, uncaught error and unhandled rejection — mirrored, never
  replaced, so devtools still see everything,
- every frame of the BLE JSON-RPC,
- **Run Bluetooth self-test**: reachability of the local service, `ping`, then the adapter's
  permission and power state with an actionable sentence,
- **Copy**, with a select-the-text fallback for when WKWebView refuses the clipboard.

Also reachable as `#ble-debug` in the URL and as `window.__brickwrightDiagnostics.open()`.

## Gates

- `test/native-bluetooth.test.mjs` — drives the shim against a fake native server through
  the whole chain (requestDevice → connect → service → characteristic → notify → write),
  plus the powered-off refusal, plus assertions that both extensions dial the local service
  first and take their peripheral from `didDiscoverPeripheral`. Both halves were checked
  red by mutation.
- `npm run verify:bluetooth` — the production bundle in Chromium with Web Bluetooth deleted
  and `__TAURI__` faked: the shim installs, the panel opens **from the Settings menu**, its
  Close button is on-screen and finger-sized, and the self-test names the unreachable
  service.
- `cargo test` in `apps/tauri/src-tauri` covers the advice table and the two-dialect scan
  failure.

## Still unverified, and only a device can settle it

Nobody has run this on a physical iPhone/iPad with a hub. What the diagnostics panel is
for: `Run Bluetooth self-test` answers, in order, whether the local service is reachable
(Rust side up), whether `getStatus` returns `handler: initialised` (btleplug/CoreBluetooth
came up), and what `bluetooth permission` and `adapter power` actually are. If all four are
healthy and a scan still finds nothing, the next suspect is the scan filter — LEGO hubs
advertise their primary service UUID, and `ScanFilter::AnyService` is matched against the
advertisement, so a hub that only advertises manufacturer data would need
`build_scan_filter` extended.
