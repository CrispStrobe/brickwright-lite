# Robot Lab: every hub, every route — plan (2026-10-18)

**Owner (2026-10-18):** the Robot Lab becomes its own tab; "all must be steerable also by
pseudocode and blocks and other code flavors. motors etc directly by code/blocks. and also the
hubs. in the end we must cover all lego hubs from rcx nxt ev3 wedo boost spike etc."

Abbreviations: X = `overlay/scratch-vm/src/extensions/crispstrobe`, G = `overlay/scratch-gui/src/lib`.

## Where each hub stands

| Hub | Blocks | Code flavours | Compile / emulate | Real hardware | In the Lab |
|---|---|---|---|---|---|
| SPIKE Prime / Robot Inventor | `X/spikeprime` (+ BLE/BTC/bridge variants) | `DEVICE SPIKE`; SPIKE 3 Python → blocks | Renode firmware lockstep (`G/bw-sim/routes/renode-lockstep/`) | Web Bluetooth, Scratch Link, bridge | **yes** (`SpikeVirtualHub`; Renode route) |
| SPIKE Essential | via `X/legopoweredup` | — | — | BLE (LWP3) | no |
| Boost / Powered Up (City, Technic, Move) | `X/legoboostunified`, `X/legopoweredup` | Python/JS `_legopoweredup.*` calls only | — | Web Bluetooth LWP3, Scratch Link BLE, bridge | no |
| WeDo 2.0 | `X/wedo2unified` | as above | — | Web Bluetooth (own WeDo service, not LWP3) | no |
| EV3 | `X/ev3comprehensive`, `X/ev3dev` | `DEVICE EV3`, MakeCode EV3 | LMS → RBF in the extension | Scratch Link BT, serial, bridge, HTTP | no |
| NXT | `X/legonxt` | — | NXC hosted compile → `.rxe` | Scratch Link BT, Web Serial, bridge | no |
| RCX | `X/legorcx` (NQC) | NQC tab | NQC WASM; clean-room `RcxVm` (`G/bw-sim/routes/rcx-vm/`) | IR tower (`G/rcx-download-hook.js`) | **yes** (`RcxVirtualHub`; download target "Robot Lab RCX", 2026-10-19) |

## Design

**Programs on a simulated hub.** Never edit the extensions; swap the transport underneath them, so the
real extensions are what is tested:
- LWP3 hubs (Boost, Powered Up, Technic, SPIKE Essential) and WeDo 2: a virtual GATT peripheral through
  `registerVirtualPeripheral` (`G/virtual-hub/web-bluetooth-shim.js`), plus a Scratch Link BLE socket double.
- EV3 and NXT: a Scratch Link BT-classic virtual peripheral (JSON-RPC `discover`/`connect`/`send` with
  direct-command / telegram bytes), generalising `VirtualSpikeClassicSocket` into a registry.
- RCX: `runtime.rcxDownload` gains a "Robot Lab RCX" target that loads the `.rcx` into `RcxVm`.
- `connect-virtual-spike.js` becomes `connectVirtualHub({extensionId, hubState})`.

**Steering the Lab.** One façade `G/bw-sim/api/robot-lab-api.js` over `SimSession`: scene (`loadModel`,
`start`, `stop`, `reset`, `setTimeScale`, `camera`, `spawn`), direct control (`setMotor` by actuator or
part: power, speed, degrees), reads (`readSensor`, `pose`, `encoder`), `onContact`. Installed as
`runtime.robotLab` (the `runtime.nqcCompile` / `runtime.rcxDownload` hook pattern). Direct motor commands
go through a `lab-direct` hub profile, so they still cross the VirtualHub boundary (one clock, rollback).
One method list, four surfaces: a `robotlab` blocks extension; `lab …` pseudocode words
(`robotLabDialect.js`, one table for parser and decompiler, allowed under any DEVICE line); a
`robotlab` runtime extension in `SB3Creator.RUNTIME_EXTENSIONS` for Python/JS (`_robotlab.*`); the
test handle `window.__bwSimLab`.

**Hub models.** Motors are catalogued (`G/bw-sim/devices/catalog.js`, Philo numbers: RCX 2838/71427,
NXT, EV3 L/M, PF, PU, Boost, Control+). Missing: sensors other than SPIKE's, the SPIKE small motor (65),
and hub profiles other than SPIKE. Per hub: WeDo 2 (A, B; tilt, motion; the Scratch VM is the
controller); LWP3 hubs (LPF2 ports, internal IMU; a clean-room LWP3 controller: StartSpeed, ForDegrees,
GotoAbsolute); EV3 (A–D, inputs 1–4; direct commands first, then a clean-room LMS VM from LEGO's
published developer docs); NXT (A–C, 1–4; direct commands, then an `.rxe` VM from the published
executable spec); RCX (A–C, 1–3; the existing `RcxVm`).

## Phases

- **P0 contracts:** `connectVirtualHub`, BT-classic and BLE virtual-peripheral registries, `lab-direct` hub.
  **`lab-direct` done 2026-10-19** (lane/simlab-api-20261019): `G/bw-sim/hubs/lab-direct/` (profile + VirtualHub,
  the SPIKE controller structure, exported to the worker's mirror), registered in `hubs/index.js`; a model with
  motors and no hub part runs on it (`sim-session.js` `sceneHubDefs`); the *Motor bench* model shows it.
  Open: `connectVirtualHub` and the BT-classic/BLE peripheral registries (they serve P3–P5).
- **P1 Robot Lab API** + `robotlab` blocks + `lab` words + `_robotlab` for Python/JS. Accept: `setMotor`
  drives an encoder to 360 ± 2° with no hub program; part poses deterministic across rollback.
  **Done 2026-10-19** (lane/simlab-api-20261019; docs/SIM-LAB.md "Steering the Lab"): `G/bw-sim/api/robot-lab-api.js`
  installed by the pane as `runtime.robotLab` and `window.__bwSimLab.api`; `X/robotlab` (14 blocks, EN+DE, in the
  extension library); `G/robotLabDialect.js` (`lab` words under any DEVICE, one table) layered on the pinned
  sb3-creator at its door (`G/robot-lab-pseudocode.js`); `_robotlab` in `RUNTIME_EXTENSIONS` with a 'simulator'
  driver bound to the API and the Python/JS lift back. Both acceptances are tests
  (`test/bw-sim-robot-lab-api.test.mjs`); round trips of every block in `test/robot-lab-dialect.test.mjs`;
  browser gate `verify:sim-lab --part=api`. Decision: a motor on a hub that runs its own program (firmware
  route, RCX VM) is refused by name; on a SPIKE hub run from Scratch blocks the API commands the hub's own
  controller. Open: the RCX hub (P2, on another lane) gets the same refusal by having no `directCommand`
  until it is merged here; `camera` and `setTimeScale` have no blocks yet; Python in the Code tab's console
  cannot reach the Lab (Skulpt in a worker) — its route is ⇦ To blocks.
- **P2 RCX** (pulled forward: the VM exists): `hubs/rcx/`, virtual `rcxDownload`, RCX sensors.
  **Done 2026-10-19** (lane/simlab-rcx-hub-20261019): RCX 2.0, mini-motor 71427, touch/light/rotation
  sensors as parts and devices; "Robot Lab RCX" as an explicitly chosen download target; the RCX
  bumper car with a bumper and a line-follower NQC example; docs/ROBOT-LAB-RCX.md "The hub".
  Open: the 9 V motor 2838 as a part, RCX readouts in the pane, the direction-change pause.
- **P3 LWP3 hubs and WeDo 2:** Technic L motor on port A by 360 ± 2° from `legopoweredup` blocks; a
  WeDo 2 conveyor; DEVICE words for WEDO2/BOOST/POWEREDUP.
- **P4 EV3:** direct commands, then the LMS VM; the wall-stop scenario through `DEVICE EV3` and RBF.
- **P5 NXT:** same shape; the hosted NXC compiler is a network dependency (a local NXC WASM build is the
  alternative).

**Risks.** Clean-room VMs only, sources recorded (D4); never ship LEGO firmware; EV3 in Renode would need
a user-supplied image. LWP3/EV3 controller behaviour is our model — compare with real-hardware captures.
Host-run programs follow the VM's clock (one clock). Mixed scenes with a Renode hub stay refused (D3).
Code-tab gap: hubs without DEVICE words are reachable by blocks only until their word tables exist.
