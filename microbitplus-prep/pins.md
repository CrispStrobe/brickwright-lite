# microbitPlus — Pins / GPIO block group

Design note for implementation against the scaffold.

## Opcode table (from study §5.3)

| opcode | block text | shape | args | menus |
|--------|-----------|-------|------|-------|
| `digitalwrite` | set pin [PIN] digital [LEVEL] | C | PIN menu {gpio}, LEVEL menu {0,1} | `gpio`: {0,1,2,8,12,13,14,15,16} |
| `digitalread` | pin [PIN] digital value | R | PIN menu {gpio} | |
| `ispinhigh` | pin [PIN] is high? | B | PIN menu {gpio} | |
| `analogread` | analog value of pin [PIN] | R | PIN menu {analogIn} → 0–1023 | `analogIn`: {0,1,2} |
| `analogwrite` | set pin [PIN] analog [PCT] % | C | PIN menu {gpio}, PCT number (0–100) | |
| `setpull` | set pin [PIN] pull [MODE] | C | PIN menu {gpio}, MODE menu | `pull`: {none,up,down} |
| `whentouch` | when pin [PIN] touched | H (edge) | PIN menu {analogIn} | `isEdgeActivated: true` |
| `istouch` | pin [PIN] touched? | B | PIN menu {analogIn} | |

**8 blocks.** Menus: `gpio` = {0,1,2,8,12,13,14,15,16}; `analogIn` = {0,1,2};
`pull` = {none,up,down}; `digitalLevel` = {0,1}.

## Backend-S lowering (MicroPython each block emits)

Each block dispatches to `this._backend.methodName(...)` per §5.4.
Backend S translates to MicroPython and sends it to the sim via postMessage.

| opcode | MicroPython emitted | notes |
|--------|-------------------|-------|
| `digitalwrite(PIN,LEVEL)` | `pin{PIN}.write_digital({LEVEL})` | PIN is the micro:bit pin number (0,1,2,...) |
| `digitalread(PIN)` | `pin{PIN}.read_digital()` | returns 0 or 1 |
| `ispinhigh(PIN)` | `pin{PIN}.read_digital() == 1` | boolean wrapper |
| `analogread(PIN)` | `pin{PIN}.read_analog()` | returns 0–1023; only P0/P1/P2 |
| `analogwrite(PIN,PCT)` | `pin{PIN}.write_analog(int({PCT}*1023/100))` | PCT 0–100 → 0–1023 DAC value |
| `setpull(PIN,MODE)` | `pin{PIN}.set_pull(pin{PIN}.{PULL_MODE})` | PULL_MODE: NO_PULL / PULL_UP / PULL_DOWN |
| `whentouch(PIN)` | edge-poll: `pin{PIN}.is_touched()` | isEdgeActivated hat; sim polls in bw_script loop |
| `istouch(PIN)` | `pin{PIN}.is_touched()` | boolean reporter |

### generateC / generatePy notes

- `sb3-creator-micropython.js` already emits `pin0.write_digital(1)` etc.
  when it sees `PIN red = P0 OUTPUT` + `turn on red`. The block→MicroPython
  path reuses the same vocabulary.
- The `@bw pin` marker lines that the debugger needs are emitted by the
  same MicroPython writer that backs Backend S, so blocks-run and sim-run
  share one source of truth.
- `analogwrite` maps to `write_analog` (10-bit DAC), NOT PWM duty.
  MicroPython's `write_analog(v)` does PWM with v/1023 duty cycle.
- Pull modes: MicroPython constants are `pinN.NO_PULL`, `pinN.PULL_UP`,
  `pinN.PULL_DOWN`.
- Pin touch sensing uses capacitive touch on P0/P1/P2 only.
