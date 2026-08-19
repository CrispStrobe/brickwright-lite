# LEGO architecture — the three open gaps

*Internal technical doc, English-only (per the bilingual rule: user-facing getting-started
docs are EN/DE, implementation contracts stay English). Written 2026-08-19.*

## What already exists (so we don't rebuild it)

A complete, MPL-2.0, CrispStrobe-authored LEGO extension suite lives in
`overlay/scratch-vm/src/extensions/crispstrobe/`:

| Hub | Extensions | Transport | Deliverable (codegen) |
|---|---|---|---|
| Spike Prime | `spikeprime`, `spikeprimeble`, `spikeprimeBTC`, `legospikeprimeBLE`, `spikeprimeBridge` | Web BLE / Scratch Link / bridge | SPIKE Python |
| EV3 | `ev3comprehensive`, `ev3dev` (id `scratchtoev3`), `ev3lms`, `legoev3direct` | Scratch Link / BLE / serial / WS | EV3 Python (ev3dev2), LMS bytecode |
| NXT | `legonxt` | BTC / Scratch Link / bridge | NXC |
| Boost | `legoboostunified` | BLE / Scratch Link / bridge / GATT | transpile |
| WeDo 2.0 | `wedo2unified` | BLE / Scratch Link / GATT | transpile |
| Powered Up | `legopoweredup` | BLE / Scratch Link / GATT | transpile |

These do two things: **connect** to a real hub, and **transpile** the Scratch blocks
(including their own extension blocks) to code the hub runs. The per-hardware transpilers
that produce the on-brick code live in a separate repo, `github.com/CrispStrobe/extensions`
(e.g. `ev3dev_py_transpile.js` → real ev3dev2); `sb3Creator.js` already knows this split —
its emitter distinguishes a `simulator` mode from an `ondevice` mode, and `ondevice`
(ev3dev/pybricks) defers to those per-hardware transpilers.

**On GPL:** `ev3dev` is GPL, but our `ev3dev` extension (MPL-2.0) *generates/streams* Python
that runs on the user's own ev3dev brick — it does not vendor or link ev3dev's code. Same for
`legonxt` (emits NXC, compiled elsewhere) and `ev3lms` (LMS bytecode). We produce code for
their runtime; we never embed their runtime. The GPL boundary is never crossed.

The **faceplate campaign** (bw-circuit-ui widgets + bw-board faces + the LCD/RGB widgets in
flight) adds the **offline visual face** for these hubs — what a learner sees when no hardware
is connected.

That is the ground truth. Three architectural gaps remain on top of it.

---

## Gap 1 (highest priority) — pseudocode ⇄ Scratch-with-LEGO-blocks

**The islands.** Two authoring worlds exist and do not meet:

- `.bw` (BrickWright dialect) transpiles to `c | micropython | python | sb3` via `bw`
  (`sb3-creator/bin/bw.mjs`). Its `sb3` output is generic Scratch.
- The LEGO extensions transpile *Scratch-with-LEGO-blocks* ⇄ *hub code*.

There is **no edge** between `.bw` and the LEGO extension blocks. A `.bw` program cannot be
expressed as a LEGO-block project, and a LEGO-block project cannot be read back to `.bw`.

**What's missing, concretely:**
- **Forward:** a device-aware sb3 emitter so `bw transpile <f.bw> --to sb3 --device spikeprime`
  (or ev3/nxt/…) emits a project whose blocks are the hub extension's opcodes — mapping the
  dialect's motor / sensor / display / wait verbs to each hub's block set. The scaffolding is
  there: `sb3Creator.js` already reconciles `project.extensions` with the opcodes actually used,
  and already maps some extensions' field-blocks (the `stc12` pin blocks). What's missing is a
  **per-hub block-map** (dialect verb → extension opcode + arg shape), anchored on each
  extension's `getInfo` block set.
- **Reverse:** `bw read` a LEGO-block `.sb3` → `.bw`. Today the reverse transpilers
  (`basicToPseudocode.js`, `pythonToPseudocode.js`) know only the `arrays` extension. A LEGO
  block → dialect-verb table is the mirror of the forward map.

**Why it's the priority (above Gap 2):** it is the missing joint that connects the whole stack
— pseudocode ⇄ blocks ⇄ hub. Without it, everything a learner authors in `.bw` is invisible to
the LEGO extensions and vice versa; with it, the same program flows from pseudocode to blocks
to a real Spike/EV3 and back.

**Lives in:** `sb3-creator` (`sb3Creator.js` forward emitter + a reverse table), the
`CrispStrobe/extensions` per-hardware transpilers, and the `bw` CLI. Needs a per-hub block-map
authored from each extension's `getInfo`.

---

## Gap 2 (lower priority) — an editor for the hub deliverables

The Code tab edits `.bw`, `.py`, `.js`, `.c`, `.bas` (`cm-lang-basic.js`), and `.asm`
(`cm-lang-asm.js`). But the LEGO-hub *deliverables* have no first-class editor:

- **NXC** (NXT) — its own C-like language, no CodeMirror mode.
- **LMS bytecode** (EV3 original firmware) — a binary artifact, not hand-editable by design.
- **SPIKE Python / ev3dev Python** — these *are* Python, so `.py` opens them, but there is no
  hub-API-aware mode (completion/lint for the SPIKE or ev3dev2 APIs).

**Proposed:** a `cm-lang-nxc` mode, and optionally SPIKE/ev3dev Python API awareness layered on
the existing Python editor. Explicitly ranked **below Gap 1** by the owner — round-tripping
pseudocode matters more than hand-editing the generated hub code.

**Lives in:** `lite` (Code tab, `cm-lang-*`).

---

## Gap 3 — a stateful brick + world model behind the faces

The faces today are a **view**, not a **simulation**. `bw-board/src/face.js` (129 lines) is a
render binding (`matrix | lcd | level | needle`) that reads existing circuit-device state
(`board.getDeviceState`) or a Scratch variable. There is no LEGO brick model, and nothing
tracks what the hub is actually doing.

The pattern to follow already exists on the STC12 side: `stc12SimulatorDriver` in
`sb3Creator.js` turns the emitted program into a **simulated board** ("boundary A"), attached
via `bw_board`. A LEGO brick sim is the same idea with a richer model.

**What a real simulation needs:**

1. **Brick state** — held, not just rendered:
   - display contents (matrix pixels / LCD framebuffer / status-light colour),
   - actuator state per port: servo angle, motor speed **and** position, sound, LED,
   - so the face shows the *current* state, and the program can read it back.

2. **A world model** — what the sensors receive, per port:
   - colour, distance/ultrasonic, IR signal, touch/button, gyro/tilt, reflected light, force.
   The sensor blocks read from this world, not from thin air.

3. **Bidirectional drive** — two directions must both work:
   - **code → world:** the program mutates actuator + display state (outputs),
   - **world → code:** sensor reads come from the world, and the world is settable **both by
     the program's environment and by UI widgets** — the learner pokes a colour, a distance, an
     IR code, a button press, a servo/motor override, and the running program sees it.

4. **Feedback loop** — actuator state can feed sensor state: a motor's commanded speed
   integrates to a rotation the encoder/position sensor then reports; a servo's angle is its own
   readback. Outputs are not write-only.

**Proposed shape:** a `legoSimulatorDriver` per hub runtime, analogous to
`stc12SimulatorDriver` — a brick-model object `{ ports[], display, actuators, sensors }` plus a
`world` object the sim reads sensors from. Input widgets (button, colour picker, distance
slider, IR) **write** the world; display/gauge widgets **read** the brick model. The face
becomes the view over this model instead of over raw variables. Each hub's port count, sensor
kinds, and value ranges come from the matching extension's device model (see Gap 1's
block-map) so the sim, the blocks, and the real hardware agree.

**Lives in:** `lite` faces + `bw-circuit-ui` widgets + `bw-board` device model, following
`sb3-creator`'s simulator-driver pattern.

---

## Priority order

1. **Gap 1** — the pseudocode ⇄ LEGO-blocks joint (connects the whole stack).
2. **Gap 3** — the stateful brick + world sim (makes the offline face actually *run*).
3. **Gap 2** — the NXC / hub-API editor (nice-to-have; `.py` already covers the Python
   deliverables).

Gaps 1 and 3 share the same anchor: a per-hub device model (ports, sensor/motor kinds, display,
value ranges) authored from each extension's `getInfo`. Writing that model once serves the
block-map (Gap 1), the sim (Gap 3), and the faces (the current campaign).
