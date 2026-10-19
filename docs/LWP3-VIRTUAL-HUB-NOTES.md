# Robot Lab radio hubs: LWP3 and WeDo 2.0 — protocol notes and sources (2026-10-19)

The Robot Lab simulates the LEGO hubs that a program reaches over Bluetooth Low Energy — the
BOOST Move Hub, the Powered Up (City) Hub, the Technic (Control+) Hub and the SPIKE Essential hub
(LEGO Wireless Protocol 3, "LWP3"), and the WeDo 2.0 Smart Hub (its own GATT service) — so that the
**real** LEGO extensions are what runs: `legopoweredup`, `legoboostunified`, `wedo2unified` (and
scratch-vm's own `boost`, `wedo2`), unchanged. Their transport is swapped underneath them
(docs/ROBOT-LAB-HUBS-PLAN.md, Design). This file says what the virtual hubs implement, from which
source, and what they do not.

| Module | What it is |
|---|---|
| `overlay/scratch-gui/src/lib/bw-sim/hubs/lwp3/lwp3-protocol.js` | LWP3 framing: constants, encoders, the common header |
| `…/hubs/lwp3/profiles.js` | the four LWP3 hubs as HubProfiles, with System Type, name, firmware and port map |
| `…/hubs/lwp3/lwp3-controller.js` | one port's motor controller: what each Port Output sub command does |
| `…/hubs/lwp3/lwp3-virtual-hub.js` | `Lwp3VirtualHub`: the VirtualHub step + the protocol the extensions talk to |
| `…/hubs/wedo2/wedo2-protocol.js`, `wedo2-virtual-hub.js` | the WeDo 2.0 hub: its GATT services, no motor controller |
| `overlay/scratch-gui/src/lib/virtual-hub/lab-ble-peripherals.js` | the scene's hubs as virtual BLE peripherals |
| `…/virtual-hub/scratch-link-ble.js` | a Scratch Link BLE socket double over the same peripherals |
| `…/virtual-hub/connect-virtual-hub.js` | `connectVirtualHub({extensionId, hubState})`: the program's extension → this hub |
| `overlay/scratch-gui/src/lib/legoHubsDialect.js` | the `pup` / `boost` / `wedo` words (one table, parser and decompiler) |

## Sources

- **LEGO**: "LEGO Wireless Protocol 3.0.00", https://lego.github.io/lego-ble-wireless-protocol-docs/
  (© 2018 LEGO System A/S; read 2026-10-19). Section numbers below are this document's. It is the
  only source for the LWP3 byte layouts and command semantics; the hub is written from it
  ("clean room": no firmware, no other implementation's code).
- **LEGO**: the WeDo 2.0 SDK (2.4.0, the official archive), as quoted in docs/WEDO-HUB-PROTOCOL-NOTES.md:
  services `1523` / `4F0E`, characteristics `1527`, `1560`, `1563`, `1565`.
- **scratch-vm** (BSD-3-Clause, Scratch Foundation; in this repository):
  `extensions/scratch3_wedo2` (the WeDo input/output command layouts, how values are read),
  `extensions/scratch3_boost` (the Move Hub's port ids before and after firmware 1.0.00.0224, the
  manufacturer-data filter), `io/ble.js` and `util/scratch-link-websocket.js` (Scratch Link's BLE JSON-RPC).
- **community** (marked so in the code, used only where LEGO's document is silent):
  node-poweredup (MIT) `src/hubs/*.ts` port maps and `src/consts.ts` IO type ids beyond LEGO's list,
  pybricks (MIT) device ids and the Technic hubs' System Type ids; mode numbers and value formats of
  the motors, the Move Hub tilt and the Technic hub tilt (a real hub reports them through Port Mode
  Information 0x44, §3.20, which these hubs do not implement).

## LWP3: what the hub implements

| § | Message | Implemented as |
|---|---|---|
| 3.1, 3.2 | Common header, length encoding | length (one byte up to 127, escaped two bytes above), hub id 0, type |
| 2 | Advertising | manufacturer data company 0x0397, button, System Type and Device Number, capabilities, last network, status (Scratch Link filters match on it) |
| 3.5 | Hub Properties | Request Update / Enable Updates of Advertising Name, Button, FW and HW Version (§3.5.6 encoding), RSSI, Battery Voltage (100 %), Battery Type, Manufacturer Name, LWP Version (3.00, §3.5.7), System Type ID, Primary MAC → Update (0x06); Set, Reset, Disable are accepted silently |
| 3.6 | Hub Actions | Switch Off / Disconnect → "Hub Will Switch Off / Disconnect"; the motors float |
| 3.7 | Hub Alerts | Enable / Disable accepted; Request → Update with status 0x00 (no alert is ever raised) |
| 3.8 | Hub Attached I/O | every port with a device and every internal device, 15-byte Attached messages, when the host subscribes to 0x1624 |
| 3.9 | Generic Error | Command NOT recognized (0x05) for an unimplemented message type or sub command; Invalid use (0x06) for a port without a device or a command a motor cannot take; Buffer Overflow (0x03) |
| 3.17, 3.23, 3.21 | Port Input Format Setup (Single) → Port Input Format (Single) → Port Value (Single) | the handshake echoes mode, delta, notification; the current value follows; then one Port Value whenever the value moved by the Delta Interval (or by 1 for delta 0), sent once per physics batch |
| 3.26, 3.27 | Port Output Command | StartPower (as WriteDirectModeData mode 0, §6.1), SetAccTime, SetDecTime, StartSpeed, StartSpeedForTime, StartSpeedForDegrees, GotoAbsolutePosition, PresetEncoder (WriteDirectModeData mode 2; and 0x14 with one Int32 on one port — the form the LEGO extensions send, see Findings), WriteDirectModeData to the hub LED |
| 3.32, 4 | Port Output Command Feedback, buffering | with the feedback bit: Busy/Empty (0x01) for a command that runs, Idle + completed (0x0A) when it completes or at once for an instantaneous one; Discarded (0x04) when an execute-immediately command interrupts one; Busy/Full (0x10) for a buffered one (one slot) |

**Not implemented**: Port Information and Port Mode Information (§3.15, 3.16, 3.19, 3.20), combined modes
(§3.18, 3.22, 3.24), virtual ports and synchronised commands (§3.25; sub commands 0x02, 0x08, 0x0A,
0x0C, 0x0E — refused as not recognised), H/W network and firmware update messages (§3.10–3.14),
WriteDirect (0x50).

### The motor controller (lwp3-controller.js)

What LEGO's document fixes is followed: StartPower is "adjustable PWM output … no speed regulation"
(§6.1: 0 float, 127 brake); StartSpeed keeps the speed "NOT using power-levels greater than MaxPower"
and Speed 0 holds position (§3.27.5); the timed and degree commands end in their EndState
(0 float, 126 hold, 127 brake, §3.27.7); a degrees command's direction is the sign of its speed (§3.27.9);
SetAccTime/SetDecTime are the time from 0 to 100 % and back (§3.27.3/4), used when the command's
UseProfile bits say so; PresetEncoder "will automatically STOP the motor" (§3.27.13).

What it does not fix is the Robot Lab's model, on the SPIKE controller's structure (trajectory generator
→ reference angle → PI + damping → PWM duty into the motor's DC model, hubs/spike/spike-motor-controller.js):
100 % speed = 0.9 × the motor's no-load speed at the hub's supply (devices/catalog.js, Philo's numbers);
without a profile the reference accelerates at 1500 °/s²; a degrees/position command completes when the
reference has arrived and the encoder is within 1° and slower than 10 °/s (or after 200 ms of a saturated,
still shaft); an EndState other than 0 or 126 brakes; a motor without a tacho (IO type 0x01, 0x02) runs
speed commands open loop and refuses degrees. The supply is 9 V (6 AA/AAA cells; sag not modelled).

### The hubs

| Hub (set) | LDraw part | System Type | Ports (LWP3 id) | Internal devices | Source of the port map |
|---|---|---|---|---|---|
| BOOST Move Hub (88006, in set 17101) | `26910.dat` | 0x40 (§2.1, LEGO) | A 0x37, B 0x38 (built-in motors), C 0x01, D 0x02 | LED 0x32, tilt 0x3A (type 0x28), current 0x3B, voltage 0x3C | scratch-vm scratch3_boost (firmware ≤ 1.0.00.0223), node-poweredup |
| Powered Up Hub, "City hub" (88009) | `28738.dat` | 0x41 (§2.1, LEGO) | A 0x00, B 0x01 | LED 0x32, current 0x3B, voltage 0x3C | node-poweredup |
| Technic Hub, "Control+" (88012) | `22127.dat` | 0x80 (community) | A–D 0x00–0x03 | LED 0x32, current, voltage, temperature 0x3D, accelerometer 0x61, gyro 0x62, tilt 0x63 | node-poweredup |
| SPIKE Essential hub (45609) | `67351c01.dat` | 0x83 (community) | A 0x00, B 0x01 | LED 0x31, temperature, accelerometer, gyro, tilt 0x63 | node-poweredup |

The Move Hub reports firmware **1.0.00.0223** and uses that firmware's port ids (A 55, B 56, C 1, D 2):
the ids changed with 1.0.00.0224, and both BOOST extensions address the old map (see Findings). Its two
built-in motors are internal joints of the hub part (`actuatedBy: 'built-in'`, contracts.js), A on the
left output and B on the right, wired so that the same positive speed drives the rover forward.
Tilt values: the Move Hub's mode 0 is two Int8 degrees (roll, pitch); the Technic hub's mode 0 three Int16
(yaw, pitch, roll) — from the hub body's pose (sensors.js imuFromPose); axis signs are not checked against
hardware.

### Devices

| Device (set) | LDraw | IO type | Catalogue device |
|---|---|---|---|
| Control+ Technic L motor (88013) | `22169.dat` | 0x2E | `technic-large-motor` (Philo's numbers) |
| Control+ Technic XL motor (88014) | `22172.dat` | 0x2F | `technic-xl-motor` |
| BOOST interactive motor (88008) | `26913.dat` | 0x26 | `boost-interactive-motor` |
| BOOST Move Hub internal motor | in `26910.dat` | 0x27 | `boost-move-hub-motor` |
| WeDo 2.0 / Powered Up medium motor (45303) | `21980.dat` | 0x01 | `pup-medium-motor` |
| BOOST colour and distance sensor (88007) | `26912.dat` | 0x25 | `boost-color-distance`: colour index (mode 0) and reflection (mode 3) from the colour probe; proximity (mode 1) only "something within 32 mm" (0) or not (10) |
| WeDo 2.0 tilt sensor (45305) | `20841.dat` | 0x22 | `wedo2-tilt`: the sensor's pitch and roll |
| WeDo 2.0 motion sensor (45304) | `20844.dat` | 0x23 | `wedo2-motion`: a 25 cm ray; detect 0..10 over 15 cm (estimated) |

**Parts, checked against the LDraw library (2026-09-30)**: every number above exists there; their
connectors, colliders and shell masses are derived by `scripts/derive-part-meta.mjs`, completed by hand
(devices, probes, hub profiles, the motors' output colliders; masses with batteries are estimates).
Not used: `45301.dat` is a *Wedge 4 x 16 Triple Curved*, not the WeDo hub (LDraw's WeDo 2.0 hub is `19071`
with its battery box, `19066c01` without); `88006`, `88009`, `88012`, `45609` are set numbers, not LDraw
files; the SPIKE Essential small motor (`68488`, IO 0x41) has no catalogue numbers yet (not a part here).

## WeDo 2.0

docs/WEDO-HUB-PROTOCOL-NOTES.md says why this is not LWP3 and gives the sources. The virtual hub
implements: Attached IO (1527) on subscription (motor 0x01, tilt 0x22, motion 0x23 on connect ids 1/2;
current 3, voltage 4, piezo 5, RGB LED 6); Output Command (1565) motor power (Int8, 0 float, 127 brake:
a duty, no regulation), play/stop tone (recorded, no sound), RGB; Input Command (1563) sensor format →
Input Values (1560) `[0x00, connect id, value]` in raw (one byte), percent (one byte) or SI (Float32);
reads of battery (2A19), low-voltage alert (1528), button and name; Disconnect (152E). The first byte of
an Input Values notification is not interpreted by any reader cited; it is sent as 0x00. The supply is
3 V (two AA cells, `HUB_SUPPLY_VOLTS.wedo2`, estimated).

## Transports

- **Web Bluetooth**: the registry of `web-bluetooth-shim.js` (`registerVirtualPeripheral`), now telling a
  peripheral when the host subscribes (`onStartNotifications`) so a hub answers then, as a real one does.
- **Scratch Link BLE**: `scratch-link-ble.js` answers Scratch Link's JSON-RPC (`discover` → `didDiscoverPeripheral`,
  `connect`, `read`, `write`, `startNotifications` → `characteristicDidChange`, base64) for `/scratch/ble` on
  the loopback and device-manager hosts — **only** while a virtual chooser is installed (connectVirtualHub)
  and a virtual peripheral is registered; otherwise every socket is the page's own (real Scratch Link).
  A filter's `manufacturerData` is matched on what the peripheral advertises; services outside the
  discover's allowance are refused as Scratch Link refuses them. BT-classic (`/scratch/bt`) is never touched.
- Notifications are delivered on a later task, in order, never re-entrantly.

## Findings about the extensions (not changed here: the rule is to test them unchanged)

- **legoboostunified** picks the Move Hub's old port map whenever the *bugfix* field of the firmware
  version is ≤ 23 (`split(".")[2]`), i.e. for every real firmware; scratch-vm's scratch3_boost compares the
  whole version with 1.0.00.0224. On a hub with current firmware its A and B would be wrong.
- **legoboostunified** sends MaxPower **10 %** with every speed command (`BoostMotorMaxPowerAdd` used as the
  value, where scratch3_boost adds 10 to the power): the motors are limited to a tenth of their power.
- **legoboostunified** and **legopoweredup** rate-limit by a strict 50 ms spacing with no burst: a block for
  "AB" sends A and drops B (the BOOST example uses one block per motor).
- **legopoweredup** sends EndState **128** for brake and 127 for hold (LWP3: 127 brake, 126 hold); the hub
  brakes for both. Its "turn motor off" is StartSpeed(0), which §3.27.5 defines as *hold position*. It shows the
  System Type as "Unknown Hub" for real ids (it reads 0x80 against node-poweredup's 1…8 enum). Its Port Input
  Format Setup for a motor is often dropped by the same rate limiter right after connecting.
- Both send PresetEncoder as sub command 0x14 with one Int32 on a single port; §3.27.14 defines 0x14 for a
  synchronised pair (the single form is WriteDirectModeData mode 2). The hub accepts it.

## Tests

`test/lwp3-virtual-hub.test.mjs` (byte layouts written out from the document, the physics for completion),
`test/wedo2-virtual-hub.test.mjs`, `test/scratch-link-ble-double.test.mjs`, `test/lego-hubs-dialect.test.mjs`,
`test/lab-hubs-extensions.test.mjs` (the real extensions through the Scratch VM, both transports, Jolt),
`test/bw-sim-hub-boundary-imports.test.mjs` (the hubs reach no physics), browser gate
`npm run verify:sim-lab -- --part=hubs-ble`.

## Next steps

- `DEVICE POWEREDUP` / `DEVICE BOOST` / `DEVICE WEDO2` declarations: the pinned compiler's DEVICE line names a
  build target (`SB3Creator.STC_PARTS`); the words work under any DEVICE line meanwhile. Hats and Boolean
  blocks of the three extensions are not words yet (`learner-gap` in the dialect).
- Python/JS runtime ops for the three extensions (as `_robotlab`), so the Code tab's other flavours reach them.
- Port Mode Information (§3.20) so a host that asks for modes gets them; synchronised (virtual) ports.
- The SPIKE Essential small motor and 3×3 light matrix as parts; the City hub's train motor; a hub LED in the view.
- Compare the controller with captures from real hubs (the plan's risk note).
