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
| A2 | MakeCode census: the remaining 15 partial programs | Object/class-style programs (`hero.get`, `ghost.change`), the runtime images API (gameofLife, the last recompile case), radio packet fields. New dialect/importer features, each proved by `scripts/makecode-census.mjs` running the program in the real simulator. Done when each program is either full-pass or its refusal names a specific, documented cause. | DONE 2026-09-29 — census (`docs/generated/MAKECODE-CENSUS.md`) MakeCode apps **190 full / 15 partial / 1 recompile -> 204 full / 2 partial / 0 recompile** for the programs this task held (measured before A3 landed: 204 / 2 / 7 needs-extension / 2 not-a-program). With A3 merged the census reads **204 full / 8 partial / 2 not-a-program / 1 needs-extension** of 215 — the 6 extra partials are A3's newly compiling extension programs, their extension calls named (turtle, blockchain, rc-car's radio name/value pair, v2-cat-napping's `loops.everyInterval`). lite's own corpus at the same tree 205 -> 218 full, nothing worse. 14 of the 16 programs full: gameofLife, karel, radio-dashboard, hot-or-cold, plant-watering, rps-teams, voting-machine, reaction-time, v2-blow-away, v2-clap-lights, v2-morse-chat, v2-play-sound-long, timing-gates, rotary-dial-radio. The 2 left name their cause: **infection** — `class Message` wraps a `Buffer` (control.createBuffer, getNumber/setNumber) in get/set accessors and travels by `radio.sendBuffer`/`onReceivedBuffer`: the dialect has no byte buffer and no binary radio packet (and `game.showScore` has no word); its `Player` class, `GameIcons` table, switch and early returns now translate. **radio-bridge** — `radio.writeReceivedPacketToSerial` prints each packet's send time, and a MicroPython radio packet carries none. Upstream: sb3-creator#38 (merge `5c20cc83`, CI run 36542985073), extensions#25 (merge `5966529a`); Lite: PR #533 (receipts in LANES.md DONE). |
| A3 | Offline MakeCode extensions | The 7 `needs-extension` census programs use third-party MakeCode extensions (e.g. neopixel, sonar). Vendor the most common ones pinned by sha with licence checks, so they compile and simulate offline. | DONE 2026-09-29 — PR #528. Vendored at exact commits (`scripts/sync-makecode-extensions.mjs`, blob-sha and licence checked; all MIT, none refused): pxt-microturtle v0.0.9 (Microsoft), pxt-radio-blockchain v0.1.4 (Microsoft), pxt-kitronik-motor-driver v0.0.3 (Kitronik Ltd). pxt's offline glue serves them; an uncarried GitHub extension is refused as `NO_EXTENSION` by name. Per program, before → after: turtle-scanner, turtle-spiral, turtle-square, micro-coin, rc-car/connect: needs-extension → partial (extension calls named unsupported — Lite's micro:bit dialect has no turtle, blockchain or motor-driver block, so no mapping); v2-cat-napping: needs-extension → partial (pxt-microbit's own `datalogger` package, now resolved; `loops.everyInterval` named); eddystone-beacon: stays needs-extension — its page names package `device`, which does not exist, and the program needs `bluetooth` (no Bluetooth in Lite's simulator either). Census 190 full / 21 partial / 2 not-a-program / 1 needs-extension / 1 recompile. |
| A4 | Arcade export gaps | Scratch → Arcade: broadcasts, costume/backdrop switching, clones, sounds, pen, lists, mouse. Map the doable ones; each remaining refusal stays named. | DONE 2026-09-29 — PR #534 (Lite only: the exporter is not vendored). Before, every construct was refused by opcode. After: broadcasts → a dispatch that starts every receiver (clones too); `broadcast and wait` waits on exactly those, and a running receiver restarts. Costumes → `Image[]` + `sprite.setImage`. Backdrops → `scene.setBackgroundImage`, plus `when backdrop switches to` and `… and wait`. Clones → a SpriteKind per cloned sprite with per-clone variables, costume and pen; `delete this clone` → `destroy()`. Sounds → `music.playTone` when the sound is one steady tone (measured); notes, rests, tempo and volume map, while sampled audio is named and a drum is kept as a rest. Lists → `any[]` with Scratch's 1-based rules. Pen → a layer sprite (down, up, clear, stamp, colour, size), with hue named. Mouse → stays a named refusal: Arcade has no pointer on hardware, and browser-events works only in the simulator. Each mapping runs in pxt-arcade's own simulator with a mutation that goes red; matrix in `docs/ARCADE-COMPAT-PLAN.md`. |
| A5 | Arcade export: `stop` block semantics (found by A4) | The exporter turns every `stop` block into `game.over(false)`, so `stop this script` / `stop other scripts in sprite` end the whole game, and this is not named as a refusal. Map each stop option to its Scratch meaning, or name it. Queued after B, since it was found, not chosen. | DONE 2026-09-29 — PR #545 (Lite only: the exporter is not vendored). Before, every option was `game.over(false)`, silently: a lose screen, with the game's scripts still running under it. After: `stop this script` → `return` (from a custom block, back to its caller); `stop other scripts in sprite/stage` → that sprite's or clone's other runs end at their next yield and this one carries on (per-run tokens); `stop all` → `_stopAll()`, which ends every run, deletes clones, stops sounds and clears bubbles while the game goes on, so later hats run and the flag scripts do not rerun (`control.reset()` was measured and rejected). An unknown option is named. Five sim tests with 10 mutations that go red; the corpus compiles 42/42; `game.over` emissions 8 → 0, refusals 176 → 176. Remaining (named): a waited tone of a stopped script plays out. See docs/ARCADE-COMPAT-PLAN.md. |

## B — hardware, emulation and circuits

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| B1 | PWM duty in bw-board | Analog outputs (analogWrite, servo, LED dimming) are on/off in the circuit. Add a duty-cycle model so LED brightness and motor speed follow the program, across all MCUs. | PARTIAL 2026-09-29 — bw-board #138 (merge `931854479`) + Lite #538. MEASURED: emulated timers (avr8js OCR, rp2040js PWM slices, STM32F0 TIM3, emu8051 PCA) already carried duty as real edges (`analogWrite(9, 64)` into 220 R + LED = 25.1 % of full-on; motor speed and servo angle followed). Hosts with no timer lost it: stc12 drivers' `b.setPwm` had no method; MakeCode/micro:bit+ drove `>= 50 %` on/off — 25 % = 0.000 mA, 75 % = 12.549 mA. MODEL: `setPwm` = true switching by the board inside `advanceTo` (one mechanism for LED, motor, servo; an averaged duty x V drive reads a 25 % red LED dark). Error: exact over whole periods in the 20 ms LED window, else ≤ period/20 ms per reading; vs ngspice PULSE transient, linearity < 0.002 % of full-on. AFTER: 25 % = 3.137 mA = 25.00 %; MakeCode analog 256 = 25 % (was 0 mA). Routes: avr8js Timer PWM — honoured (edges); rp2040js PWM — honoured (edges); STM32F0 TIM3 — honoured (edges); emu8051 PCA — honoured (edges, 1 µs poll); stc12 JS/Python drivers `setPwm` — honoured (new); MakeCode sim bridge analog write — honoured (new, 50 Hz); micro:bit+ `analogwrite` — GAP (still `>= 50 %`; fix is upstream in CrispStrobe/extensions); micro:bit+ servo — GAP (stub); stc12 VM pin blocks — GAP (write `_stc12Pins`, read by nothing, digital too); devices `set motor speed` — GAP (refused, no `speed` control); devices `set servo angle` — target honoured, canvas shows no pulses (GAP in bw-circuit-ui); MakeCode `servoWritePin`/`analogSetPeriod` — unverified; labwired nRF PWM / ESP32 LEDC — unverified (edges only if the engine emits them). |
| B2 | Visible LED matrix in labwired | labwired cannot trace nRF GPIO, so an emulated micro:bit's 5×5 display is not visible. Add nRF GPIO tracing in labwired and wire the matrix into Lite's board face. | DONE 2026-09-29 — labwired-core fork #123 (`a7c7cbdf`: GPIOTE owns its pad, `led-matrix-mux`, micro:bit V1/V2 displays; release `labwired-wasm-a7c7cbdf`), bw-board #143 (`5eeb4922`: the matrix onto the micro:bit part, UICR segments), bw-circuit-ui #75 (`b6b18822`: the micro:bit face draws it), Lite pins + universal-hex V2 section + UICR. A real MakeCode V2 heart shows as the heart; see LANES.md DONE. |
| B3 | Auto-seat Calliope/CPX parts | `bw-circuit-ui` infer-seated has no Calliope or CPX footprint/pad mapping. Add both. | DONE 2026-09-29. bw-circuit-ui #73 (merge `c8b72ad8`, CI run 36553730296 green) and Lite PR #540 (pin `cd1308a3` -> `c8b72ad8`; receipts in the LANES.md DONE row). Reproduced before: the seated inference built the generic 8051 `mcu` DIP with pins `Pundefined.undefined` for `DEVICE CALLIOPEMINI` + `PIN led = P0 OUTPUT` and for a CPX stc. `DEVICE MICROBIT` failed the same way, so the micro:bit was not working either and is fixed by the same table. Now `makeCodeBoardFor()` seats `calliopemini` / `circuit_playground_express` (`cpx`, `adafruit`) / `microbit`. Pins map to the sidecar pads by name (`P0` -> `p0`, `A1` -> `a1`), a non-pad pin is refused by name, and the board's 3V pad feeds the rails. Evidence: pad -> 1k -> LED carries ~1.45 mA returning through the board's own GND pad (upstream for Calliope and CPX, and in Lite `test/makecode-board-seated-inference.test.mjs` for all three, red at the old pin). Upstream mutations (drop the mapping, swap two pads, wrong supply pad) each go red. Not done: a MakeCode CPX project has no path into the declarations (the dialect has no CPX device), and circuit -> declarations (`BOARD_TO_DEVICE`) still omits these boards. |
| B4 | EV3 import into Lite's dialect | MakeCode EV3 programs → Lite's EV3/LEGO dialect and blocks, like the micro:bit importer, with a round-trip census. | DONE 2026-09-29 — sb3-creator #39 (merged `b58a2254`: `DEVICE EV3`, 48 words = 48 of the 74 pinned `ev3comprehensive` opcodes, the other 26 classified) + Lite #542 (pin, `lib/bw-makecode/{ev3-translate,export-ev3}.js`, census section). Census (`docs/generated/MAKECODE-CENSUS.md`), every program in the pxt-ev3 1.4.41 docs: **258 programs, 257 compile as written: 100 full, 157 partial, 1 not-a-program; 0 silent-loss, 0 recompile, 0 parse**; 1208 EV3 blocks made; micro:bit and Lite sections unchanged. Partial = named: screen images/moods (bitmaps, no extension block), sound files, pair moves without a length (two motor runs), flashing lights, medium motors (driven as large), console, motor regulation. No side-by-side test: Lite has no EV3 runtime (no virtual EV3), so the proof is round trip + pxt-ev3 recompile. |
| B5 | PWM follow-ups (gaps named by B1) | stc12 Scratch VM pin blocks write a map nothing reads, so even digital writes never reach the board (a bug, not a PWM gap); micro:bit+ `analogwrite` still on/off (one-line fix in CrispStrobe/extensions); micro:bit+ servo blocks are empty stubs; devices `set motor speed` refused (motor model has no speed input); servo canvas shows "no signal" (bw-circuit-ui); multimeter on a PWM net reads instantaneous, not average; MakeCode `servoWritePin`/`analogSetPeriod`, labwired nRF PWM and ESP32 LEDC unverified. Queued after B4, since found, not chosen. | PARTIAL 2026-09-29 — extensions #26 (merge `4d65f562`), bw-board #139 (`cfacdf60`), bw-circuit-ui #74 (`e9ebcf11`), Lite PR (this pin bump; receipts in the LANES.md DONE row). Before → after, measured at the old pins then the new: stc12 VM pin blocks — wrote `_stc12Pins`, read by nothing, LED 0 mA → drive `runtime.circuitBoard` (setPin/setPwm/setTone, inputs armed; 25 % = 25 % of full-on; reads come from the circuit); micro:bit+ `analogwrite` — `>= 50 %` on/off (25 % = 0 mA) → setPwm at 50 Hz (N % of full-on within 0.5 %); micro:bit+ servo/continuous servo — stubs → CODAL frame 50 Hz, 500 + deg·2000/180 us (0–180 within 0.5°); devices `set motor speed` — refused → N % duty on the MCU pin that drives the motor (walked through base resistor/NPN; same omega as setPwm on the pin); devices `set servo angle` — no pulse, canvas "no signal" → pulse on the servo's pin + engine `signal` field the face reads; servo calibration (found) — 1000–2000 us vs every driver's 500–2500 us (45° read 0) → 500–2500; multimeter on a PWM net — instantaneous on/off → both Circuit-tab meters show bw-board's 100 ms mean (exact over whole periods of 500/50 Hz; DC identical); MakeCode `servoWritePin` — a 0 % PWM, servo stayed at 90° → host reports the angle, bridge sends the servo frame; `analogSetPeriod` — ignored (always 50 Hz) → the program's period is the carrier. GAPS: labwired nRF52 PWM and ESP32 LEDC emit no pad edges (labwired-core `95774285` models registers/events only), so duty from those engines does not reach the circuit; motor `direction` stays refused (needs an H-bridge IN-pin map); stc12 `set PORT`/`set PART`/screen/segment/keypad blocks still keep state no circuit reads; sb3-creator devices JS/Python drivers still stub `setServo`/`setMotor`; the VM route was not driven in a browser. |
| B6 | PWM pad edges from labwired nRF52 PWM and ESP32 LEDC (found by B5) | labwired-core models nRF52 PWM and ESP32 LEDC as registers/events only, so a program's duty on those chips never reaches the circuit (B5 GAP). Make each drive its pad through the engine's pad seam (as GPIOTE now does), so `analogWrite`/LED dimming on a micro:bit or ESP32 bench follow the duty. Found by B5, not chosen. | CLAIMED 2026-09-30 (VPS Claude, session 6f571e07; see LANES.md) |

## C — infrastructure and RISC-V (before D)

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| C1 | Shared node_modules guideline | Every session's Lite worktree installs ~2 GB of `node_modules`, and `/mnt/volume1` keeps filling. A documented helper (script + `CLAUDE.md`) that links a shared, lockfile-keyed install instead. | DONE 2026-09-29 — PR #547. `node scripts/worktree-deps.mjs link` builds a store keyed on the lockfiles, pins and Node/npm majors, populated with CI's own install commands and hardlinked read-only; the overlay targets are private copies. `verify` proves a worktree matches its lockfiles and pins. `gc` evicts idle keys that no worktree still links. The guideline is in LANES.md (worktree protocol step 1, and "OPERATIONAL — shared node_modules"), because Lite's `CLAUDE.md` is gitignored. **Saving:** about 1022 MB per worktree becomes about 80 MB (2.4 MB root + 77.7 MB gui of new blocks); the store holds one ~1 GB copy per key. **Parity:** the same 14-file subset (pin/adoption, declared-pins-wired, notices-coverage, overlay pairs, real-VM game examples) gave 414/414 with identical verdicts fresh, relinked and linked-without-install. `test/worktree-deps.test.mjs` needs no network; 9/9 guard mutations were caught. |
| C2 | Faster Linux boot | Browser Linux boot is ~9 s. Predecoded-instruction cache and/or a post-boot snapshot so the lesson opens at the prompt in under 1 s. | DONE 2026-09-29 — Lite PR #551; bw-board #140 (snapshot) + #141 (decode cache), pin `aeed114f`; media-lab `07132874` (+ #17). Run now opens the lesson at the `bwb# ` prompt from a post-boot snapshot (2.0 MB, pinned by sha256, built on bw-board CI, byte-identical to a cold boot: output, instruction count and final machine state over ls/echo/cpuinfo/uname); "Boot from scratch" keeps the full boot. Measured (bw-board CI, same runner): snapshot open to the prompt 0.046–0.048 s in Chromium, 0.12 s in Node; cold boot 3.53–3.61 s → 2.46–2.52 s in Chromium and 17.44 → 23.06 MIPS (1.32x) in Node with the decode cache. Lite browser gate, Run → prompt, fetch included: before 6.7–7.6 s (main); after **0.7 s** from the snapshot with the three files fetched in parallel (0.3 s of it the download), into C3's terminal with the boot log replayed; Boot from scratch 4.7 s (run 36587368893; the first, sequential-fetch run 36583415771 read 1.5 s, 1.3 s of it the download). |
| C3 | Better Linux console | Raw keys, Ctrl-C and arrow keys in the Linux lesson console (a proper terminal), not line input only. | DONE 2026-09-29 — Lite #550 (no upstream change needed). The console is xterm.js 6.0.0 (MIT, exact pin, lazy chunk) at a fixed 80×24 (a UART has no TIOCSWINSZ; busybox assumes 80×24), fed by our own key→byte table (`lib/bw-debug/terminal-keys.js`: Enter CR, Backspace DEL, Ctrl-A..Z 0x01..0x1a, arrows/Home/End CSI or SS3 under DECCKM, xterm editing/F-keys, UTF-8) through `lib/bw-debug/linux-console.js`, which holds input until the shell is up and then hands the 16550A one 16-byte FIFO at a time, only once LSR.DR is clear. Evidence: `test/linux-terminal.test.mjs` boots the real Linux 6.1 from the lesson's pinned media — a raw-mode probe shows the guest receives the table's bytes verbatim, Ctrl-C ends `sleep 100` and `yes` (exit 130), Up recalls ash history, Backspace edits, a 4 KB paste gives `wc -c` 4096 + matching md5sum with ≤16 bytes outstanding at the UART; the CI browser gate `scripts/verify-cpm-system.mjs` types real keystrokes into the terminal and reads xterm's rendered rows (uname, Ctrl-C, Up, Backspace, clear, SGR colour, bare CR, a 2 KB clipboard paste). Mutations red: Enter→LF, arrows→nothing (Node and the built app), no FIFO pacing, no queue, wrong Ctrl-letters, Backspace→BS, no ready gate. Measured: bw-board's UART RX is unbounded, so an unpaced 128 KB paste also arrives intact today; the pacing is what a real 16550A needs and is held by the occupancy assertion. |
| C4 | Un-park E8 (CPU internals) | In-order pipeline, cache and branch-predictor models over the RISC-V core, with a pipeline diagram in Lite. | DONE 2026-09-29 — bw-board #142 (merge `542fb29e`), Lite #554 (pin aeed114f→542fb29e). Timing is a separate consumer of a retired-instruction trace; the Spike-checked core stays the source of truth. The trace hook wraps `step()` per core instance and peeks through side-effect-free methods `step()` never calls. Its cost when off, against the decode-cached core, interleaved on CI: xv6 1.00x (A/A 0.99x); Linux Node 0.97x (A/A 1.00x, overlapping trial ranges); Linux Chromium 1.004x. The models: a 5-stage pipeline (forwarding on/off, load-use, resolve EX/ID, mul/div latency; cycles = insts + fill + Σ stalls exactly), set-associative I/D caches (LRU/FIFO/random, WB+WA), and static-nt/bimodal/gshare predictors with a BTB. They report named stats and a per-cycle occupancy record. Evidence: hand-derived cycle tables asserted exactly (load-use 14/19, ALU chain 10/20, loop 44/38/30/46/45, strided walk 141/261, LRU-vs-FIFO 41/51). The cache matches a brute-force reference access by access. FreeRTOS, RVC and the Sv32 kernel are bit-identical traced vs untraced. 14 mutations red. Lite: a Debug-pane pipeline diagram (stalls lower-case and coloured by reason), the CPI breakdown, cache and predictor stats, and settings, in EN and DE. A DOM test renders the real pane on a real target (14 cycles, addi row `..FdDXMW......`). Not yet: TLB, L2, warm-up checkpoints (E8.5), the gem5 cross-check, a Playwright gate. Receipts in LANES.md DONE. |
| C5 | Follow-ups found by C4 | (1) bw-board RISC-V debug target `reset()` in program mode returns to pc 0 instead of the image entry (recorded in bw-board ROADMAP E8). (2) Lite `browser (light)` lego starter-journey check reads the selected tab without waiting — a race that went red once on #554 and passed on rerun; make it wait on the state it reads. Queued after D, since found, not chosen. | DONE 2026-09-29 — Lite PR #561; bw-board #144 (merge `ab87a27c`), pin `5eeb4922`→`ab87a27c`. (1) A program-mode RISC-V debug reset now restarts the loaded image at its entry with the loader's hand-off (pc, sp, argc/argv), the architectural state of a fresh load; convention as every other bench: a CPU reset, RAM kept, decode cache flushed, timing models fresh. Was pc 0 / sp 0. `test/riscv32-debug-reset.test.mjs` 3 cases, red 3/3 before, 7 mutations each red; bw-board CI 36613905649. (2) The starter-journey "opens the <editor> editor" check waits (`waitForFunction`, 10 s) for the predicate it asserts; proved on #554's own build with tab selection deferred: old check red at 5 s, new green at 5 s and with none, red past the bound. |

## D — SPIKE, robotics and Pybricks

| # | task | scope / done-when | status |
| --- | --- | --- | --- |
| D1 | SPIKE 3 Python: close refusals | 34 of 73 SPIKE 3 functions are refused by name. Map the ones the arena or the dialect can support (sensors, motor modes, light matrix). | DONE 2026-09-29 — Lite PR #555; CrispStrobe/extensions#27 (`e82ebcd`) and sb3-creator#40 (`a2032f71`). Before → after: `color_sensor.rgbi()[0..2]` refused → mapped; `motion_sensor.angular_velocity()` refused → approximate; `light.color` refused → approximate; `sound.volume` refused → mapped; `distance_sensor.show` refused → approximate; `distance_sensor.clear` refused → mapped; `light_matrix.show` refused → approximate. The other 27 stay refused, each with a named reason: `motor.get_duty_cycle/status/info`, `distance_sensor.get_pixel/set_pixel`, `force_sensor.raw`, `light_matrix.get_pixel/set_orientation/get_orientation`, `motion_sensor.gesture/stable/quaternion/get_yaw_face/set_yaw_face/tap_count/reset_tap_count`, and `hub.temperature/battery_voltage/battery_current/battery_temperature/usb_charge_current/device_uuid/hardware_id/power_off/reset/soft_reset/bootloader`. 34 → 27 refused; full table in `docs/SPIKE3-PYTHON.md`. |
| D2 | More arena units | Units beyond "Rover basics": sensors in depth, gyro turns, mapping, a capstone mission. Original content, EN and DE, reference and wrong solutions auto-checked. | DONE 2026-09-29 — Lite #557. Sensors in depth: sd01 blue marker, sd02 trail to the red flag, sd03 docking distance, sd04 door in the wall (side-mounted distance sensor), sd05 feel the way (force). Gyro turns: gt01 half a right angle, gt02 worn wheel, gt03 hexagon patrol, gt04 about turn. Mapping: mp01 count the finds, mp02 back to the find, mp03 replay the route (list). Capstone: cp01 supply run, 4 stages with partial credit. Every reference passes and every wrong solution fails for a pinned reason in the real VM path; mission table in docs/SPIKE-ARENA.md "The units". |
| D3 | 3D view of the arena | A three.js view over the same arena snapshot state, as a toggle beside the 2D view. No new physics. | DONE 2026-09-30 — Lite PR #568: three 0.186.1 (MIT, exact pin, lazy chunk `bw-arena-3d`, held out of the first load by verify-boot-payload), scene built headless from the one snapshot and asserted against it (every mission; a driven path; the capstone reference in the real VM with identical verdict/time), no-WebGL fallback EN/DE, browser gate toggles 3D and runs gt01 with it open. |
| D4 | Pybricks header PR | Review the disputed `pb_kwarg_helper.h` provenance; no further external action authorized. | CLOSED / PROVENANCE UNRESOLVED 2026-09-30 — sent as pybricks/pybricks-micropython#508 (head CrispStrobe:cleanroom-kwarg-helper-v2 `9120e981`, on upstream master 81bb7272). Re-verified against current master first: upstream had added `PB_PARSE_ARGS_METHOD_SKIP_SELF` (used in the new hub_network file, compiled out of the virtual hub), which the Sep-25 draft lacked and which would have broken the EV3/Prime/Essential builds; added reportedly from its one call site; VPS logs confirm a separate restricted-source implementer, but not contract-only or OS/network isolation. Reported equivalence evidence (not reproduced in this audit): virtualhub 12/12 tests (58 cases) identical, 34-call argprobe identical, 85/85 call sites + 205 table entries identical, hub_network on primehub_f4 (ARM, LTO off) 5 tables byte-identical, text -104 B. Fork CI could not be used (fork workflows need a one-time UI enable). Bug-fix PR #507 still open. |
| D5 | Dialect drops a statement whose argument is a spaced expression (found by D2) | `move forward (finds * 15) cm` is dropped with only a parse WARNING — a silent loss for any program not checking warnings (the Rover-basics unit test doesn't). Find every statement word whose argument parser can drop an expression, make them accept it (or refuse loudly as an error), and add an anti-silent-loss gate over the arena units + example corpus. | DONE 2026-09-30 — sb3-creator #41 (`fa96f5f5`) + #42 (`b4eb4073`), Lite PR #564. Root cause: statement rules matched `line.match` with `(\S+)` / lazy `(.+?)` slots, and `parse()` turned every unread line into a warning. Now every rule matches through `matchTopLevel` (a slot is one term; a (parenthesised expression) is a term), positional slots are one term each, and an unread line is refused (`UnparsedLinesError`). Word-family table over all 211 statement rules (155 value slots × 6 probes) + 37 EV3 slots, before → after: SPIKE ok 48 / DROPPED 80 / wrong-block 16 → ok 112 / refused 32; micro:bit ok 267 / DROPPED 26 / wrong-block 16 / wrong-value 3 → ok 303 / refused 21; circuit/MCU ok 552 / wrong-value 120 / DROPPED 32 / wrong-block 34 → ok 658 / refused 79 / wrong-value 1; Scratch core ok 286 / DROPPED 2 → ok 287 / refused 1; EV3 unparenthesised DROPPED 73 + 1 wrong variable → refused 74 (full table in #564). Gate: `test/dialect-no-dropped-lines.test.mjs` (331 .bw + example modules + SPIKE 3 fixtures, 0 unread lines). MakeCode census raw counts: micro:bit apps 204/8/2/1 → 204/8/2/1; EV3 100 full/157 partial/1 → unchanged (1208 blocks); lite→micro:bit 218 full/83 partial/30 recompile → 150/130/29 + 22 retarget (the old DEVICE-line swap dropped Arduino pins silently: 39 "full" did nothing). |
| D6 | Dialect remainders found by D5 | (1) ~40 declaration refusals in `parseStcDeclaration` still warn-and-skip the declaration (statements using it are refused, but the declaration line itself is lost with a warning) — make them errors like D5's `DIALECT_UNPARSED_LINES`; (2) escaped quotes in text literals (`"a \"b\""`) are not unescaped by the value parser (and the exporter must escape them back: round-trip fixed point); (3) `set voxel pick random 1 to 10 1 1 to 1` misreads: an unbracketed multi-word reporter fills adjacent positional slots — refuse unbracketed reporters in multi-slot rules. | DONE 2026-09-30 — sb3-creator #43 (`8f4b6316`) + #44 (`4d9828d2`) + #45 (`82c04190`), Lite PR #576. (1) Declarations: 78 warn-and-skip sites in `parseStcDeclaration` (+ SHAPE/COSTUME/BACKDROP: stage shape, unknown shape, unknown art when art is registered) → refused via `refuseDeclaration()` (`DIALECT_UNPARSED_LINES`, line+reason); an unmatched declaration keyword is refused by name; the one warning left keeps its line (LEDBANK8/SEVENSEG8 port share). Corpus 426 programs: 0 refused before and after. Consumers: device-idle-coverage's `STC12/STC89/STC15` rows named no device and silently tested the default chip (fixed); i8086 reach censuses: 80-a2-lcd-moving-text + 81-8051-lcd1602-parallel (parallel LCD1602 on i8086) were counted parsed-hollow → parseFailed, named (parsed 150 → 148); retarget reasons now name the refused line (#44); Lite's i8086 export gate wrote `DEVICE 8086`, silently the default STC12 before → 8086/8088/i8088 are aliases of i8086 (#45); the picker's `riscv32` and `arduboy` have no dialect DEVICE and are now refused by name (they parsed as the default STC12). (2) Text escapes `\" \\ \n \r \t` (JSON's) in the value parser, direct-capture rules, scanners, initialisers, and the decompiler (`dtext`); before: `say "a \"b\""` stored the quotes and backslashes and export wrote `"${text}"` unescaped → now parse → blocks → export → parse is a fixed point (14 texts × 13 text inputs + print/raw/initials/broadcasts; Python/JS/host C/micro:bit MicroPython round trips). Readers fixed: host C, micro:bit MicroPython, BASIC, Lite's MakeCode TS import; the micro:bit MicroPython emitter no longer splits a text at a line break. (3) Spilled reporters: census of all 71 multi-slot rules × 9 unbracketed reporters (1122 cells): ok 596 / refused 425 / WRONG VALUE 101 → ok 596 / refused 526 / WRONG 0; EV3 word slots 105 cells: WRONG 34 → 0; custom-block calls WRONG → refused. MakeCode census raw counts unchanged: micro:bit apps 204/8/2/1, lite→micro:bit 150/130/29 recompile/22 retarget, EV3 100 full/157 partial/1. |


## PR #508 review — 2026-09-30

**Finding about the earlier PR, updated after VPS transcript recovery:** the
parent did task a separate agent, expressly prohibiting access to the old
helper body. The recorded process supports a restricted-source rewrite
attempt. It does not support the stronger description “only a functional
contract” or “cut off from web/file access”: the implementer read permitted
caller/API source and had repository/network tools. No recorded display of
the old helper macro body was identified, but broad searches included the
file and later compilation/comparisons mechanically processed it. We do
not assert absolute absence of file reads, verified legal clearance, or a
finding of infringement or intentional deception.

[Pybricks PR #508](https://github.com/pybricks/pybricks-micropython/pull/508)
was closed without merge at 2026-09-30 14:00:54 UTC. The maintainer disputes
its provenance statement. No messages, edits, pushes or other writes to
GitHub were made during this local review.

Evidence:

- Submitted commit `9120e9813cdb113467c5524dd60c7bfbf8d04386` changes only
  `pb_kwarg_helper.h`: 147 additions, 95 deletions. The replacement uses
  enum indices and five-element descriptors; the old implementation uses
  indexed expansion and three-element descriptors. Both use a variadic
  count/dispatch and a finite chain of expansion macros. Those similarities
  alone establish neither copying nor independence.
- The submitted header retains “The Pybricks Authors”, changes the copyright
  years from 2018–2020 to 2026, and removes the CC-BY-SA marker and the two
  Stack Overflow source references. Saying all human attribution was removed
  is inaccurate; the missing original notices and source credits still matter.
- The shipped header hash is `3e47942a39a7191647cc169e4e1aa72ed9570e4a1f5f846067d17b4c7010ca10`.
  The submitted header hash is `b1ee51dd1f0fddbd47e0b08d2c48ba82c9e5054d2cf3ec8f15c69ed72a36409e`.
  They differ only by the submitted `PB_PARSE_ARGS_METHOD_SKIP_SELF` addition.
- Lite PR #334 first built the original header under a recorded exception,
  then commit `576d58b5706d50ccc48052139bd47de6514c6508` introduced the
  replacement. Both record Claude session
  `df930874-a977-40f8-996f-8689b428942c`; Lite merged the lane as `50445efea`.
  That shared parent-session identifier alone did not establish implementer
  separation. Recovered VPS logs now establish a distinct rewrite subagent
  `ac322c2e8df53df20`. A compiler reading the file does not itself prove that
  its contents entered the author's context.
- The PR claims behavior and argument-table comparisons, including `-E`/`-S`
  output. These are equivalence evidence, not provenance evidence. The logs
  and comparison script were absent from the initial local checkouts. The
  recovered VPS transcript records the compiler/comparison commands; those
  historical checks have not been independently rerun in this audit.
- No matching authoring transcript was found initially in local Claude logs.
  It was subsequently recovered read-only from the owner's VPS, together
  with the rewrite subagent log. Full snapshots are retained outside git;
  task-relevant excerpts and snapshot hashes are in the private firmware
  evidence repository, `pybricks/2026-09-30-pr508/vps-transcript-audit.json`
  and `vps-transcript-excerpts.json`. The first draft predates the explicit
  old-header extraction and assembly comparisons. A pre-draft copyright
  search nevertheless included the header in its scope. No OS/network
  isolation was configured. This reviewer has read both headers.
- The recovered parent log records the September 25 hold on upstream posts,
  its relay to the implementer, and the September 30 instruction “go on with
  the still opens”, which the parent interpreted as including D4. Whether
  the owner intended that instruction to release the earlier hold is not
  established by this record.
- The maintainer's attachment shows the fork with upstream history. Possession
  of history does not prove a source read. Knowing a licence label does not
  by itself prove reading the implementation. Neither observation resolves
  the absolute “never opened/read/diffed” claim.

Initial local corrections (commit `4fd368544`, before the new replacement below):

- Restore original attribution, source references and terms conservatively in
  the overlay; keep macro code unchanged. Preserve the historical asset hashes
  and the header hash at build time separately from the corrected source hash.
- Correct THIRD-PARTY-NOTICES, bundled notices, About and PROVENANCE.json.
  The historical licence scan is retained and its evidentiary limit is stated.
- Hold `build-pybricks-wasm.sh` before any fetch, toolchain installation or
  build-directory removal. The licence gate rejects the disputed input by
  path even if someone changes its label back to MIT. No bypass is added.
- Restore the original upstream header on a local fork branch by reverting
  `9120e9813`; keep the disputed commit in history. Do not force-push or erase
  records. Public PR/timeline JSON, both original replacement versions and
  the attachment are preserved locally in `brickwright-firmware-private`,
  under `pybricks/2026-09-30-pr508/`.

Decisions at the initial correction (items 2–4 addressed by the new local implementation below):

1. Recover the original VPS authoring records. Until then the answer to “did
   we do a verified clean-room rewrite?” is **not established**.
2. For continued distribution, either restore the actual upstream header and
   rebuild with its original notices/terms, after reviewing the obligations
   for the combined firmware, or replace the helper through a documented
   independent process. Simply adding credits does not settle distribution
   obligations or repair prior releases. Retained simulator bytes are not
   newly cleared for release by this local correction.
3. If permissive-only code is required, use a separate implementer with no
   old source, old replacement, source diffs or inherited source context.
   Provide an interface specification and black-box fixtures derived from
   permitted sources; retain input/access records. Review provenance before
   removing the build hold. Direct MicroPython parsing at call sites is also
   a possible redesign, subject to the same provenance discipline.
4. Audit the separate integer-helper stand-in before making any blanket claim
   about the absence of share-alike material. Its test results do not establish
   its authorship either.
5. Any future external response needs the owner's separate instruction. If
   requested, acknowledge the unsupported absolute claim, state only facts
   verified from the record, and avoid asserting either proven innocence or
   proven intentional copying.

The original CC-BY-SA-4.0 licence requires attribution and conditions for
adapted material ([legal code, section 3](https://creativecommons.org/licenses/by-sa/4.0/legalcode)).
Its scope depends on material and rights involved; this audit does not decide
whether the replacement or whole firmware is adapted material.

Validation of the initial local correction: all 11 shipped-simulator tests pass; three
relevant bundled-notice tests pass; both edited About modules parse; overlay
and tracked package copies match. Removing the path-based provenance guard
makes its named test fail. The build script exits with the provenance hold
before any source/toolchain/build mutation. The overlay macro code is identical
before and after removing comment/blank lines, and both binary hashes match
the preserved build record. No wasm rebuild or full GUI build was performed.

## Documented contract-only replacement — 2026-09-30

The local branch `fix/pybricks-contract-api` removes the argument-helper
dependency through a documented new process. Two agents started with
`fork_turns=none`, functional contracts, and input/access restrictions. The
reviewer, who had seen the old implementations, integrated their deliveries
only afterward. Contracts, clarifications, access records, hashes and test
results are under `firmware/pybricks-wasm/contract-only/records/`.
Restrictions were instruction based, without an OS jail; no claim about model
pretraining is made. The earlier PR #508 authorship claim remains unverified.

The prepared source converts 60 MIT caller files (152 calls) to explicit
MicroPython argument tables and API calls. Neither old helper enters that
source tree. Two cited numeric snippets (scaling and integer width) are
removed and replaced with contract-only BSD-3-Clause components. Unmarked
`lib/lego/device.c` has no verified permissive grant under Pybricks' limited
repository licence; its timing functions are replaced from a separate factual
contract. The non-free Xbox module is disabled and excluded from source and
compiler lists. Historical evidence stays in the private audit repository and
git history; obsolete overlays and their CC licence payload are removed.

The new simulator passes the gate for 580 application source/header inputs
and records 55 headers from the pinned SDK separately. The gate rejects
unmarked Pybricks files, unknown outside dependencies, removed helper files,
non-allowlisted SPDX identifiers, CC-BY-SA material and source answer
references. MicroPython's own MIT licence covers its unmarked core files.
Source hashes and copyright declarations are in the shipped PROVENANCE.json.
The offline licence bundle includes BBC, lwrb, LEGO, Contiki, MicroPython
contributors and compiler runtime notices. A licence label alone does not
resolve questionable provenance.

Validation: 11 simulator tests, five About-data checks and three relevant
bundled-notice checks pass. All 38 argument probe outputs match across the old
shipped build, an upstream reference build, and the new build. The converter
has 18 synthetic tests; numeric tests cover 20,000 randomized cases at each
optimization level and constant widths 0–64; device timing tests cover 3,584
synthetic ID/mode pairs at each optimization level. The available native cc
and gcc drivers both resolve to Apple Clang 17. The integrated build compiles
the replacements with Emscripten 6.0.6. These are focused behavior checks,
not proof of every Pybricks API combination. The existing reference-build
linker warning about `pbio_main_start_application_resources` remains. No full
GUI bundle was built. The initial build hold is superseded by the audited
replacement; the earlier correction's unchanged-byte statements describe
that initial commit, not the current rebuilt simulator.

### Removing all Pybricks

This change retains Pybricks' permissively licensed simulator inputs. Full
removal is feasible as a separate compatibility project. Swapping in the
existing SpikeMotorModel cannot retain all behavior: it applies speed
instantly without Pybricks acceleration profiles, load/stall behavior or an
equivalent controller. Independent specifications and coverage are also
needed for drive bases, IMU/calibration, control settings/logging, sensor/device
modes, scheduling/awaitables, parameters, tools and system APIs before claiming
functional parity.

The broader Pybricks tree contains GPL/MPL drivers, chip-restricted libraries
and unmarked files; it cannot be retained wholesale. The compiled simulator
set is the audited boundary. The owner subsequently clarified that MPL and LGPL are acceptable too.
Their presence in other Brickwright components does not itself require
replacement. Those components still need verified provenance, suitable terms
and the applicable distribution requirements; this simulator audit is not
a blanket clearance for the whole application. Published releases are unchanged.
No remote posts, edits, pushes or PR operations were performed.

Final mutation validation: deliberately broken matrix, motor and distance
sensor builds each fail their exact intended behavioral test. The runner now
uses the prepared source, escaped exact test names and a 30-second timeout.
Replay component tests with `python3 firmware/pybricks-wasm/verify_contracts.py`;
archived access records remain unchanged. After restoring the shipped assets,
the final simulator, About-data and notice checks pass again.


## Shipped WASM licence recheck — 2026-09-30

The repeated compiler-dependency gate matches the shipped manifest exactly:
580 application inputs and 55 toolchain headers. The shipped WASM remains
SHA-256 `84e022bbfede2ad7fd397e0176e9cfc25d55270872a7466c8f29031d65be8133`.
A separate `--trace` relink produced the identical WASM and identified 90
selected members from libc, compiler-rt builtins, dlmalloc and syscall stubs
(before garbage collection, thus a conservative superset of final runtime
code). All 90 were mapped to pinned toolchain sources and their notices
reviewed. Their source/archive hashes and grants are recorded in
`firmware/pybricks-wasm/runtime-inputs.json` and shipped PROVENANCE.json.

No non-permissive compiled input was identified. Besides MIT/BSD/Apache,
linked runtime terms include Sun/fdlibm notice-preservation grants, NCSA,
LLVM exceptions and public-domain/CC0 dlmalloc. The offline notice bundle
had omitted individual Sun/fdlibm grants and some runtime copyright notices;
these are now retained by bundle_notices.py, with runtime source hashes
verified on generation. The runtime inventory is artifact-specific, not
a dynamic gate proving the linkage of arbitrary future build changes.

The remaining Stack Overflow question reference in MicroPython readline.c
concerns an MSVC-only warning pragma. Actual WASM preprocessing excludes
that branch. The Contiki-derived scheduler's “all rights reserved” phrase
is followed by the complete BSD-3-Clause grant. Neither is an identified
non-permissive compiled component.

Validation: 11 simulator tests and five About-data tests passed; repeated
notice generation is byte-identical. Two unrelated format-knowledge notice
tests could not run because bw-circuit-ui is not installed in this worktree.
WASM and loader bytes are unchanged by this notice/inventory correction.
