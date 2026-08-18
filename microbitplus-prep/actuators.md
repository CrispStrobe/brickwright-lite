# microbitPlus — Actuators block group

Design note for implementation against the scaffold.

## Opcode table (from study §5.3)

| opcode | block text | shape | args | menus |
|--------|-----------|-------|------|-------|
| `playtone` | play tone [FREQ] Hz for [MS] ms | C | FREQ number (default 440), MS number (default 500) | — |
| `playnote` | play note [NOTE] | C | NOTE menu | `note`: C4,D4,E4,F4,G4,A4,B4,C5,D5,E5,F5,G5,A5,B5 |
| `stoptone` | stop tone | C | — | — |
| `servo` | set pin [PIN] servo angle [DEG] | C | PIN menu {gpio}, DEG number 0–180 | `gpio` (shared with pins group) |
| `servocont` | set pin [PIN] continuous servo [SPD] % | C | PIN menu {gpio}, SPD number −100…100 | `gpio` |

**5 blocks.** Menus: `note` = {C4..B5, 14 notes}; `gpio` shared with pins group.

## Backend-S lowering (MicroPython each block emits)

| opcode | MicroPython emitted | notes |
|--------|-------------------|-------|
| `playtone(FREQ,MS)` | `music.pitch(int({FREQ}), int({MS}), pin=pin0)` | `import music` at top; pin0 is the default speaker pin |
| `playnote(NOTE)` | `music.pitch({FREQ_FOR_NOTE}, -1, pin=pin0)` | Map note name to frequency: C4=262, D4=294, E4=330, F4=349, G4=392, A4=440, B4=494, C5=523, D5=587, E5=659, F5=698, G5=784, A5=880, B5=988 |
| `stoptone()` | `music.stop(pin=pin0)` | Stops the current tone |
| `servo(PIN,DEG)` | `pin{PIN}.write_analog(int(25.6 + {DEG} * 102.4 / 180))` | Servo PWM: 0°=1ms pulse (25.6/1023), 180°=2ms (128/1023). MicroPython `write_analog` sets 10-bit PWM duty. The period must be set to 20ms: `pin{PIN}.set_analog_period(20)` first. |
| `servocont(PIN,SPD)` | `pin{PIN}.write_analog(int(76.8 + {SPD} * 51.2 / 100))` | Continuous servo: -100%=1ms, 0%=1.5ms (stop), +100%=2ms. Same period setup as `servo`. |

### generateC / generatePy notes

- `sb3-creator-micropython.js` already handles `set buzzer to 440 hz` →
  `music.pitch(440, pin=pin0)`. The block emitter reuses the same path.
- The `music` module is standard MicroPython for micro:bit — no import
  gymnastics needed; the sim preloads it.
- For `playnote`, the note→frequency map is resolved at emit time in the
  backend, not at block time. The block stores the note name; the backend
  converts to Hz for `music.pitch`.
- Servo blocks need a one-time `set_analog_period(20)` call per pin before
  the first write. The backend should track which pins have been configured
  and emit the period setup once per session/pin.
- Continuous servo maps SPD −100…100 to pulse width 1.0ms…2.0ms. The
  neutral (stop) point is SPD=0 → 1.5ms pulse → duty ≈ 76.8/1023.

### Note frequency table (Hz, equal temperament A4=440)

| note | Hz | note | Hz |
|------|-----|------|-----|
| C4 | 262 | C5 | 523 |
| D4 | 294 | D5 | 587 |
| E4 | 330 | E5 | 659 |
| F4 | 349 | F5 | 698 |
| G4 | 392 | G5 | 784 |
| A4 | 440 | A5 | 880 |
| B4 | 494 | B5 | 988 |
