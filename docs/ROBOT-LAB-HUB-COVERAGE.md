# Robot Lab hub coverage matrix (2026-10-20)

Which hub x extension x route x code-flavour combinations the Robot Lab (`bw-sim`) emulates and tests
end to end. Built from the code and the tests at main `95cc043c9`, not from the plans alone
(`docs/ROBOT-LAB-HUBS-PLAN.md`, `docs/ROBOT-LAB-EV3-NXT.md` were the starting point and were checked).

Abbreviations: `G/` = `overlay/scratch-gui/src/lib/`, `X/` = `overlay/scratch-vm/src/extensions/crispstrobe/`,
WB = Web Bluetooth (lite's shim `G/virtual-hub/web-bluetooth-shim.js`), SL-BLE / SL-BT = Scratch Link BLE /
Bluetooth Classic socket doubles.

## Status

- **GREEN**: a virtual hub/peripheral exists that the REAL vendored extension (or the stock scratch-vm
  extension) talks to unchanged, AND a test drives that extension through the real Scratch VM (or the real
  download hook) and judges the result from the physics, the hub's encoders or the hub's replies.
- **PARTIAL**: the real extension is driven against a virtual hub but not in the Robot Lab physics, or only
  part of the surface is driven, or the route is a fake (e.g. the in-process fake emulator).
- **PENDING #N**: an open PR adds it.
- **GAP**: no end-to-end test. Each gap says whether the virtual hub support is missing, or only the test
  (marked **test-only**).
- **n/a**: the route or flavour does not exist for that hub.

## How the tests load the real extension

- `test/helpers/bw-extensions.mjs`: `bundledExtensionIds()` (id -> vendored dir under `X/`) and
  `loadExtensionClass(dir)`; tests patch `vm.extensionManager.loadExtensionURL` to instantiate it.
- `test/helpers/lab-hubs-vm.mjs`: `runLabHubProgram(source, {modelText, mat, transport: 'ble'|'scratchlink',
  timeLimitMs, stopWhen, onFrame})` for `legopoweredup` / `legoboostunified` / `wedo2unified` (pseudocode
  `pup`/`boost`/`wedo` words -> SB3 -> VM -> extension -> WB or SL-BLE -> `G/virtual-hub/lab-ble-peripherals.js`
  -> `G/bw-sim/hubs/lwp3|wedo2` -> Jolt); `runStockHubExtension('boost'|'wedo2', {modelText, mat, steps,
  firmware})` for scratch-vm's own extensions; `modelText(file)`, `programText(file)` read shipped
  models/programs. Returns `{session, hub, written, received, ...}`.
- `test/helpers/bt-hub-vm.mjs`: `runOnBtHub(program, {modelText, mat, profile: 'ev3'|'nxt', extensionId:
  'ev3'|'ev3comprehensive'|'legonxt', timeLimitMs, stopWhen})` over SL-BT (`connectVirtualHub`,
  `G/virtual-hub/connect-virtual-hub.js`); `projectOfBlocks()` for block JSON programs.
- `test/helpers/sim-lab-vm.mjs` `runOnSimLab(source, {modelText, mat, timeLimitMs})` and
  `test/helpers/spike-arena-vm.mjs` `runOnArena` / `registerVirtualHub` / `loadSpikeProgram` for `spikeprime`.
- All use a fake clock and step the VM at 30 fps with the world ticked by the same frame.

## SPIKE Prime / Robot Inventor

Virtual hub: `G/bw-sim/hubs/spike/spike-virtual-hub.js` + `G/virtual-hub/spike-prime-peripheral.js`,
`spike-hub-state.js`; firmware route `G/bw-sim/routes/renode-lockstep/`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| spikeprime | WB | blocks / `DEVICE SPIKE` pseudocode | GREEN | `bw-sim-wall-stopper-program`, `bw-sim-line-follower-program`, `bw-sim-maze-program`, `bw-sim-sumo-program` ... (runOnSimLab); `spike-arena-sim` "the translator: every statement the spikeprime extension sends" |
| spikeprime | WB | SPIKE 3 Python (imported to blocks) | GREEN | `bw-sim-spike3-python-lab` "SPIKE 3 Python, imported to blocks, stops the Wall stopper in the Lab physics because of its reading" (+ a judge-can-fail control) |
| spikeprime | WB | Python/JS `_spikeprime.*` calls | GAP | The Code tab's Python/JS readers (`lib/robot-lab-pseudocode.js` `readPython` / `readJavaScript`, on the Translator in `sb3-creator-python.js`) lift only `scratch.*`, `_stc12.*`, `_arrays.*` and `_robotlab.*`. Every `_spikeprime.*` call is dropped ("dropped expression statement"). Pinned as todo in `hub-runtime-calls-to-blocks`. Fix: a lift in `installRobotLabReaders` driven by `SB3Creator.RUNTIME_EXTENSIONS`, after #1129, which edits the same file |
| spikeprimeble (direct BLE) | WB | blocks | GREEN | `bw-sim-spike-routes` "(a) a spikeprimeble project (SPIKE 3 direct BLE) migrates to spikeprime and stops the Wall stopper by its reading, in the Lab over Web Bluetooth". Legacy ids migrate to spikeprime on load (`lib/spike-project-migration.js`), and the test checks that only real spikeprimeble opcodes were in the file |
| spikeprimeBTC / spikeprime | SL-BT (RFCOMM double, 2.x firmware) | blocks | GREEN | `bw-sim-spike-routes` "(b) … motor A turns 360 degrees in the physics" and "(b) spikeprime over Scratch Link BT Classic stops the Wall stopper by its reading". The second needed two fixes to the double: the port report now streams on every hub change, and its distance is in whole cm, as a 2.x hub sends it (it was mm read as cm). |
| spikeprime | SL-BLE | blocks | GREEN | `bw-sim-spike-routes` "(c) spikeprime over Scratch Link BLE (the BLE double, SPIKE 3 GATT) stops the Wall stopper by its reading" (+ a judge-can-fail control) |
| spikeprimeBridge / legospikeprimeBLE | bridge | blocks | GAP | legacy ids migrated (`spike-legacy-migration`); no virtual bridge |
| Renode firmware (lockstep) | firmware route | blocks / pseudocode compiled for the firmware | PARTIAL | `bw-sim-renode-lockstep`, `bw-sim-renode-lockstep-program` against the in-process fake (`bw-sim-renode-lockstep-fake.mjs`); `-native` checks only the desktop contract |
| Renode firmware | firmware route | MicroPython on the hub | GAP | MicroPython exercised in the arena pane only (`spike-arena-pane-units`) |

## EV3

Virtual hub: `G/bw-sim/hubs/ev3/ev3-virtual-hub.js`, `ev3-peripheral.js`, `ev3-direct-commands.js`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| stock `ev3` | SL-BT | blocks | GREEN | `bw-sim-bt-hubs-program` "EV3 wall stopper: the stock Scratch EV3 blocks drive at the wall and stop before it" |
| ev3comprehensive | SL-BT | `DEVICE EV3` pseudocode / blocks | GREEN | `bw-sim-bt-hubs-program` "EV3 wall stopper: the DEVICE EV3 example through ev3comprehensive" (no longer `{todo}`; vendored ev3comprehensive has the `msgCounter`/`readBuffer` fix from upstream PR #53). Byte-level breadth (tank, sensors, sound/screen): `bw-sim-ev3-extension-bytes` |
| ev3comprehensive | upload + run | `.rbf` on-brick | GREEN (#1127) | `bw-sim-ev3-rbf-brick` "Robot Lab: the EV3 wall stopper runs wall-stopper.rbf — drives at the wall, stops before it" (clean-room VM, `routes/ev3-vm/`), plus the CDK download/start/stop system commands in the same file |
| ev3comprehensive | HTTP / `Scratch.fetch` | blocks | GREEN (#1127) | `bw-sim-ev3-rbf-ev3comprehensive` "ev3comprehensive: transpile → Scratch.fetch to the LMS compiler (stubbed) → the .rbf runs on the Virtual EV3". The real extension transpiles and posts. Only the hosted LMS compiler's reply is a recorded fixture, because that service is outside the repo. |
| ev3comprehensive | Web Serial, bridge | blocks | GAP | virtual peripheral only on SL-BT |
| ev3dev | HTTP / SSH | blocks | GAP | no virtual ev3dev brick |
| ev3comprehensive | any | Python/JS calls | GAP | The Code tab's Python/JS readers (`lib/robot-lab-pseudocode.js` `readPython` / `readJavaScript`, on the Translator in `sb3-creator-python.js`) lift only `scratch.*`, `_stc12.*`, `_arrays.*` and `_robotlab.*`. Every `_ev3comprehensive.*` call is dropped ("dropped expression statement"). Pinned as todo in `hub-runtime-calls-to-blocks`. Fix: a lift in `installRobotLabReaders` driven by `SB3Creator.RUNTIME_EXTENSIONS`, after #1129, which edits the same file |
| MakeCode EV3 | — | — | n/a | separate MakeCode simulator, not the Lab |

## BOOST Move Hub

Virtual hub: `G/bw-sim/hubs/lwp3/` (profile `boost-move-hub`), peripheral `G/virtual-hub/lab-ble-peripherals.js`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| legoboostunified | WB | `boost` words | GREEN | `lab-hubs-extensions` "the shipped BOOST example drives the Move Hub rover ahead ..." (current + legacy firmware) |
| stock `boost` | SL-BLE | blocks | GREEN | `lab-hubs-extensions` "scratch-vm's own BOOST extension finds the Move Hub by its manufacturer data over Scratch Link ..." |
| legoboostunified | SL-BLE | `boost` words | GREEN | `lab-hubs-coverage` "legoboostunified drives the BOOST Move Hub rover ahead over Scratch Link BLE" |
| legopoweredup | WB | `pup` words on the Move Hub | GREEN | `lab-hubs-coverage` "legopoweredup also drives the BOOST Move Hub ..." (SL-BLE is the same extension path, proven on the Technic and City hubs) |
| legoboostunified / legopoweredup | any | Python/JS calls | GAP | |
| any | bridge | blocks | GAP | no virtual bridge |

## Powered Up City / Technic hubs

Virtual hub: `G/bw-sim/hubs/lwp3/` (profiles `pup-city-hub`, `technic-hub`); protocol tests `lwp3-virtual-hub`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| legopoweredup | WB | `pup` words, Technic Hub | GREEN | `lab-hubs-extensions` "legopoweredup turns the Technic large motor on port A by 360 ± 2° (over ble)", "the shipped Technic Hub example ..." |
| legopoweredup | SL-BLE | `pup` words, Technic Hub | GREEN | same test "(over scratchlink)" |
| legopoweredup | WB / SL-BLE | City Hub | GREEN | `lab-hubs-coverage` "legopoweredup turns a motor on the Powered Up City Hub's port A one full turn (over ble / scratchlink)", judged against the same free motor on a Technic Hub |
| legopoweredup | WB | stop actions (brake/coast/hold) | GREEN (#1127) | `lab-hubs-extensions` "legopoweredup \"turn motor A off\" with stop action …: the Technic Hub's motor ends in …" |
| legopoweredup | any | Python/JS `_legopoweredup.*` calls | GAP | The Code tab's Python/JS readers (`lib/robot-lab-pseudocode.js` `readPython` / `readJavaScript`, on the Translator in `sb3-creator-python.js`) lift only `scratch.*`, `_stc12.*`, `_arrays.*` and `_robotlab.*`. Every `_legopoweredup.*` call is dropped ("dropped expression statement"). Pinned as todo in `hub-runtime-calls-to-blocks`. Fix: a lift in `installRobotLabReaders` driven by `SB3Creator.RUNTIME_EXTENSIONS`, after #1129, which edits the same file |
| any | bridge | blocks | GAP | |

## WeDo 2.0

Virtual hub: `G/bw-sim/hubs/wedo2/` (own GATT protocol), peripheral `G/virtual-hub/lab-ble-peripherals.js`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| wedo2unified | WB | `wedo` words | GREEN | `lab-hubs-extensions` "the shipped WeDo 2.0 example runs the motor until the motion sensor sees the wall (over ble)" + judge-can-fail |
| wedo2unified | SL-BLE | `wedo` words | GREEN | same "(over scratchlink)" |
| stock `wedo2` | SL-BLE | blocks | GREEN | `lab-hubs-extensions` "scratch-vm's own WeDo 2.0 extension runs the rover until its distance ..." |
| wedo2unified | WB / SL-BLE | tilt sensor, lights, tones | PARTIAL (test-only) | protocol in `wedo2-virtual-hub`; extension in `wedo2-lights-and-tones` / `wedo2-scratchlink-session` against fakes, not the Lab hub |
| wedo2unified | any | Python/JS calls | GAP | |

## SPIKE Essential

Virtual hub: `G/bw-sim/hubs/lwp3/` (profile `spike-essential`).

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| legopoweredup | WB | `pup` words | GAP (virtual support) | profile `spike-essential` registered, but its part 67351.dat has no entry in `part-meta/parts.json`, so no Lab model can place the hub; needs part metadata first |
| legopoweredup | SL-BLE | `pup` words | GAP (virtual support) | as above |
| spikeprime family | any | any | n/a | the Lab models Essential as an LWP3 hub |

## NXT

Virtual hub: `G/bw-sim/hubs/nxt/` (direct + system commands, files); VM `G/bw-sim/routes/nxt-vm/`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| legonxt | SL-BT | blocks | GREEN | `bw-sim-bt-hubs-program` "NXT bumper bot: legonxt turns B and C 360 ± 2° ...", "NXT motor reporters ..." |
| legonxt | SL-BT upload | `.rxe` on-brick | GREEN | `bw-sim-nxt-rxe-legonxt` "legonxt uploads touch-bumper.rxe ... stops at the wall" (#1115 merged); `bw-sim-nxt-rxe-brick` |
| legonxt | SL-BT | `nxt` DEVICE words | PENDING #1129 | |
| legonxt | SL-BT | motor sync, buttons, ultrasonic listen | PARTIAL (#1130 merged) | `bw-sim-mindstorms-model-limits` drives the virtual NXT's sync controller, buttons and ultrasonic event capture directly (and the .rxe VM's ReadButton); no test yet sends them from the legonxt extension |
| legonxt | hosted NXC -> `.rxe` | NXC source | PARTIAL | fixtures are precompiled (`test/fixtures/nxt-rxe/`); no NXC-compile-then-run test |
| legonxt | Web Serial, bridge | blocks | GAP | |

## RCX

Virtual hub: `G/bw-sim/hubs/rcx/rcx-virtual-hub.js`, `rcx-lab-target.js`; VM `G/bw-sim/routes/rcx-vm/`.

| Extension | Route | Flavour | Status | Evidence |
|---|---|---|---|---|
| (NQC tab) | download hook -> "Robot Lab RCX" | NQC on-brick | GREEN | `bw-sim-rcx-hub` "the bumper car (shipped NQC, downloaded to the Lab RCX) ...", "the line follower ..."; `bw-sim-rcx-vm` |
| legorcx | download hook -> "Robot Lab RCX" | blocks | GREEN | `bw-sim-rcx-legorcx` "legorcx blocks, sent with its own \"send to RCX\" block, run in the Lab RCX ..." (real extension transpiles, compiles locally, downloads; judged from drives and motion) |
| legorcx | IR tower (Web Serial) | blocks / NQC | n/a | real-hardware route; Lab target replaces it (`bw-sim-rcx-hub` "downloads go to the tower unless ...") |
| robotlab API | lab-direct | — | n/a | RCX refuses API motor calls by design (`bw-sim-robot-lab-api`) |

## Summary

| Hub | GREEN | PARTIAL | PENDING | GAP |
|---|---|---|---|---|
| SPIKE Prime / Robot Inventor | 5 | 1 | 0 | 3 |
| EV3 | 4 | 0 | 0 | 3 |
| BOOST Move Hub | 4 | 0 | 0 | 2 |
| Powered Up City / Technic | 4 | 0 | 0 | 2 |
| WeDo 2.0 | 3 | 1 | 0 | 1 |
| SPIKE Essential | 0 | 0 | 0 | 2 |
| NXT | 2 | 2 | 1 | 1 |
| RCX | 2 | 0 | 0 | 0 |
| **Total** | **24** | **4** | **1** | **14** |

## Gaps, by user impact

1. ~~SPIKE Prime, spikeprime over SL-BLE~~: closed by `bw-sim-spike-routes`. Was: test-only if the extension's Scratch Link mode uses the BLE double
   (`G/virtual-hub/scratch-link-ble.js`, `connectVirtualHub`); new `test/bw-sim-spike-scratchlink.test.mjs`.
2. ~~SPIKE Prime, spikeprimeble / spikeprimeBTC in the Lab physics~~: closed by `bw-sim-spike-routes`, with two RFCOMM-double fixes. Was: test-only (virtual hub exists, e2e only
   checks hub state); new test running the wall stopper with those ids.
3. ~~SPIKE Prime, SPIKE 3 Python in the Lab~~: closed by `bw-sim-spike3-python-lab`. Was: test-only; `runOnSimLab` on the
   imported program.
4. SPIKE Prime, Python/JS `_spikeprime` calls: confirmed gap. No Code-tab reader lifts them (see the row); this needs the lift in
    `robot-lab-pseudocode.js` after #1129.
5. SPIKE Prime, real Renode lockstep and MicroPython on the hub: virtual support (needs Renode in CI).
6. SPIKE Prime, bridge route: virtual bridge support missing.
7. EV3, Web Serial / bridge: virtual support missing (peripheral only on SL-BT).
8. EV3, ev3dev: virtual ev3dev brick missing.
9. EV3, Python/JS calls: confirmed gap, same missing lift as 4.
10. ~~BOOST, legoboostunified over SL-BLE~~: closed by `lab-hubs-coverage`.
11. ~~BOOST, legopoweredup on the Move Hub~~: closed by `lab-hubs-coverage`.
12. ~~Powered Up City Hub, legopoweredup~~: closed by `lab-hubs-coverage` (an in-test City Hub bench).
13. BOOST / Powered Up, Python/JS `_legopoweredup.*`: confirmed gap, same missing lift as 4.
14. BOOST / Powered Up, bridge: virtual support missing.
15. WeDo 2.0, tilt / lights / tones through the Lab hub: test-only (protocol exists in `hubs/wedo2`).
16. SPIKE Essential, legopoweredup over WB and SL-BLE: needs virtual support. The profile is registered,
    but part 67351.dat has no `part-meta/parts.json` entry, so no model can place the hub (a `bw-sim/` change;
    waits for the open Robot Lab PRs).
17. NXT, NXC compile-then-run: needs the hosted compiler; Web Serial / bridge: virtual support missing.
    #1129 (open) covers the words; #1130 (merged) added sync, buttons and ultrasonic listening to the
    virtual NXT, proven at the model level only.
18. ~~RCX, legorcx blocks into the Lab RCX~~: closed by `bw-sim-rcx-legorcx`.

None of the test-only gaps need changes under `G/bw-sim/`. #1127 (merged) closed the Powered Up stop-action
and EV3 `.rbf` cells.
