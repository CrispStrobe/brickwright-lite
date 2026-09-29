# Open tasks — owner-selected queue (2026-09-29)

The owner chose these from a menu on 2026-09-29 and set the order below. They
are worked **one after the other**. Each task is claimed in `LANES.md` (a merged
claim-only commit, per the protocol there) **before** its implementation starts,
and this file records the claim and, when it lands, the result.

Owner: VPS Claude (opus), `Claude-Session: df930874-a977-40f8-996f-8689b428942c`.

Status values: `queued` → `CLAIMED <date>` → `DONE <date>` (with PR/commit and
the evidence), or `HELD` (waiting for an owner decision).

Upstream-first applies (see `docs/VENDORING-REGIME.md`): work that belongs in
`bw-board`, `bw-circuit-ui`, `sb3-creator`, the extensions repo or `labwired`
lands there first; Lite then advances the exact pin.

## A — micro:bit and MakeCode

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| A1 | micro:bit circuit part: GND pad is a real ground | In the circuit, P0 → resistor → LED → the micro:bit's own GND pad measured **0 mA** (LED dark). With a separate ground part the pins drove 5 V, not 3.3 V. Fix in `bw-board` (GND and 3V pads source/sink like the Arduino/Pico board models), then advance Lite's pin. Done when a test drives that exact circuit to a nonzero ~3.3 V-derived current, with a mutation that reverts the fix and goes red. | DONE 2026-09-29 — root cause: bw-board never registered a `microbit` device model, so the part collapsed to the generic `mcu` surface (0.000 mA, all nodes at 5 V). bw-board #137 (merge `d29c3482c`) registers `microbit` and `microbit_breakout` as 3.3 V board models; the exact loop now carries 5.880 mA with P0 at 3.153 V (Calliope, already registered, measures the same). Mutation dropping the registration reds 7 bw-board tests; Lite's `test/microbit-pins-drive-circuit.test.mjs` is red at the old pin and green at the new one. Lite pin bump on branch `lane/a1-microbit-gnd`; receipts in LANES.md DONE. |
| A2 | MakeCode census: the remaining 15 partial programs | Object/class-style programs (`hero.get`, `ghost.change`), the runtime images API (gameofLife, the last recompile case), radio packet fields. New dialect/importer features, each proved by `scripts/makecode-census.mjs` running the program in the real simulator. Done when each program is either full-pass or its refusal names a specific, documented cause. | CLAIMED 2026-09-29 |
| A3 | Offline MakeCode extensions | The 7 `needs-extension` census programs use third-party MakeCode extensions (e.g. neopixel, sonar). Vendor the most common ones pinned by sha with licence checks, so they compile and simulate offline. | queued |
| A4 | Arcade export gaps | Scratch → Arcade: broadcasts, costume/backdrop switching, clones, sounds, pen, lists, mouse. Map the doable ones; each remaining refusal stays named. | queued |

## B — hardware, emulation and circuits

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| B1 | PWM duty in bw-board | Analog outputs (analogWrite, servo, LED dimming) are on/off in the circuit. Add a duty-cycle model so LED brightness and motor speed follow the program, across all MCUs. | queued |
| B2 | Visible LED matrix in labwired | labwired cannot trace nRF GPIO, so an emulated micro:bit's 5×5 display is not visible. Add nRF GPIO tracing in labwired and wire the matrix into Lite's board face. | queued |
| B3 | Auto-seat Calliope/CPX parts | `bw-circuit-ui` infer-seated has no Calliope or CPX footprint/pad mapping. Add both. | queued |
| B4 | EV3 import into Lite's dialect | MakeCode EV3 programs → Lite's EV3/LEGO dialect and blocks, like the micro:bit importer, with a round-trip census. | queued |

## C — infrastructure and RISC-V (before D)

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| C1 | Shared node_modules guideline | Every session's Lite worktree installs ~2 GB of `node_modules`, and `/mnt/volume1` keeps filling. A documented helper (script + `CLAUDE.md`) that links a shared, lockfile-keyed install instead. | queued |
| C2 | Faster Linux boot | Browser Linux boot is ~9 s. Predecoded-instruction cache and/or a post-boot snapshot so the lesson opens at the prompt in under 1 s. | queued |
| C3 | Better Linux console | Raw keys, Ctrl-C and arrow keys in the Linux lesson console (a proper terminal), not line input only. | queued |
| C4 | Un-park E8 (CPU internals) | In-order pipeline, cache and branch-predictor models over the RISC-V core, with a pipeline diagram in Lite. | queued |

## D — SPIKE, robotics and Pybricks

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| D1 | SPIKE 3 Python: close refusals | 34 of 73 SPIKE 3 functions are refused by name. Map the ones the arena or the dialect can support (sensors, motor modes, light matrix). | queued |
| D2 | More arena units | Units beyond "Rover basics": sensors in depth, gyro turns, mapping, a capstone mission. Original content, EN and DE, reference and wrong solutions auto-checked. | queued |
| D3 | 3D view of the arena | A three.js view over the same arena snapshot state, as a toggle beside the 2D view. No new physics. | queued |
| D4 | Pybricks header PR | Send the held clean-room MIT `pb_kwarg_helper.h` upstream (bug-fix PR already sent). Goes out under the owner's account. | HELD — owner ticked it but gave no place in the order; earlier instruction was to hold it back |
