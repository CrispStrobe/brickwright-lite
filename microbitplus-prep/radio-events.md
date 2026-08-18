# microbitPlus — Radio + Events block group

Design note for implementation against the scaffold.

## Events: Buttons, logo, gestures

### Opcode table (from study §5.3)

| opcode | block text | shape | args | menus |
|--------|-----------|-------|------|-------|
| `whenbutton` | when button [BTN] [EVENT] | H (edge) | BTN menu, EVENT menu | `btn`: {A,B,any}; `btnEvent`: {pressed,released} |
| `isbutton` | button [BTN] pressed? | B | BTN menu | `btn` |
| `whenlogo` | when logo [EVENT] | H (edge) | EVENT menu | `logoEvent`: {touched,released} |
| `whengesture` | when [GESTURE] | H (edge) | GESTURE menu | `gesture` (11 values) |
| `isgesture` | [GESTURE] happening? | B | GESTURE menu | `gesture` |

**5 blocks.** `isEdgeActivated: true` on all hat blocks.

Gesture menu: `shake`, `tilt up`, `tilt down`, `tilt left`, `tilt right`,
`face up`, `face down`, `freefall`, `3g`, `6g`, `8g`.

## Radio

### Opcode table (from study §5.3)

| opcode | block text | shape | args | menus |
|--------|-----------|-------|------|-------|
| `radioon` | turn radio on group [G] power [P] | C | G number 0–255 (default 0), P number 0–7 (default 6) | — |
| `radiosendnum` | radio send number [N] | C | N number | — |
| `radiosendstr` | radio send text [S] | C | S string | — |
| `radiosendkv` | radio send [KEY] = [VALUE] | C | KEY string, VALUE number | — |
| `whenradionum` | when radio receives a number | H | — | — |
| `radiolastnum` | last radio number | R | — | — |
| `whenradiostr` | when radio receives text | H | — | — |
| `radiolaststr` | last radio text | R | — | — |

**8 blocks.** Radio hats use edge-activated polling (§5.2): the extension
stores `_lastRadioNum` / `_lastRadioStr` and the hat fires when the value
changes from its previous poll.

## Connection

| opcode | block text | shape | args | menus |
|--------|-----------|-------|------|-------|
| `whenconn` | when micro:bit [STATE] | H | STATE menu | `connState`: {connected,disconnected} |

**1 block.** For Backend S (simulator), connection is always "connected"
once the sim iframe loads. For Backend B (BLE, later), this fires on the
Web Bluetooth connect/disconnect lifecycle.

**Event + Radio + Connection total: 14 blocks.**

## Backend-S lowering (MicroPython each block emits)

### Events → MicroPython

| opcode | MicroPython | notes |
|--------|------------|-------|
| `whenbutton(A,pressed)` | edge-poll: `button_a.is_pressed()` | The `bw_script()` loop checks transition from False→True |
| `whenbutton(B,released)` | edge-poll: `not button_b.is_pressed()` | Fires on True→False transition |
| `isbutton(A)` | `button_a.is_pressed()` | Direct boolean reporter |
| `whenlogo(touched)` | edge-poll: `pin_logo.is_touched()` | v2 only; v1 falls back to pin0 touch |
| `whengesture(shake)` | edge-poll: `accelerometer.was_gesture('shake')` | `was_gesture` auto-clears; poll reads once per tick |
| `isgesture(shake)` | `accelerometer.is_gesture('shake')` | Live check, no auto-clear |

### Radio → MicroPython

| opcode | MicroPython | notes |
|--------|------------|-------|
| `radioon(G,P)` | `import radio; radio.config(group={G}, power={P}); radio.on()` | One-time setup; re-calling reconfigures |
| `radiosendnum(N)` | `radio.send(str({N}))` | MicroPython radio sends strings; receiver parses |
| `radiosendstr(S)` | `radio.send({S})` | Direct string send |
| `radiosendkv(K,V)` | `radio.send('{K}={V}')` | Key=value as string; receiver splits on '=' |
| `whenradionum` / `radiolastnum` | `msg = radio.receive(); float(msg)` | The `bw_script()` loop calls `radio.receive()` each tick; if non-None and numeric, stores as lastNum and fires hat |
| `whenradiostr` / `radiolaststr` | `msg = radio.receive()` | Same receive loop; non-numeric strings go to lastStr |

### Connection → MicroPython

| opcode | MicroPython | notes |
|--------|------------|-------|
| `whenconn(connected)` | N/A — Backend S is always connected | Hat fires once on sim load |
| `whenconn(disconnected)` | N/A — never fires in sim | Backend B implements via BLE lifecycle |

### generateC / generatePy notes

- **Edge hats** use `isEdgeActivated: true` in getInfo(). The Scratch VM
  polls them every frame. The extension stores previous state and fires
  the hat only on transitions. This is the standard Scratch edge-hat model
  — no custom polling loop needed on the Scratch side.
- **Radio receive** requires a polling loop in the MicroPython bw_script:
  each tick calls `radio.receive()`, checks if the message is numeric or
  string, updates `_lastRadioNum`/`_lastRadioStr`, and sets a flag for the
  hat to fire.
- **Gesture names** map directly to MicroPython accelerometer gesture
  strings: `'shake'`, `'up'`, `'down'`, `'left'`, `'right'`, `'face up'`,
  `'face down'`, `'freefall'`, `'3g'`, `'6g'`, `'8g'`.
- The `button_a` / `button_b` objects and `accelerometer` module are
  always available in MicroPython for micro:bit — no import needed.
- `radio` module requires explicit `import radio` + `radio.on()` before
  any send/receive. The `radioon` block handles this setup.
- For the sim, radio between two sim instances would require a shared
  channel (e.g., BroadcastChannel API or a coordinator iframe). This is
  a v2 feature; v1 radio blocks execute against a single sim and receive
  returns None (no peer).
