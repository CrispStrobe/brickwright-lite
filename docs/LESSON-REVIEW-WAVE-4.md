# Wave 4 technical review — "Interactive systems"

Reviewed 2026-08-23 against `2e294ceaf`, re-measured against `d7325a272`. Eight lessons,
sixteen checkpoints.

**7 defective of 8 · 7 revised (one to content version 3, six to 2) · 5 defects
open in the app or an example rather than in a lesson, and 1 fixed upstream by
another lane mid-review.**

> **Updated 2026-08-24.** Four of the five open defects are now fixed — the
> faceplate mode, the widget inspector's functional config, the re-bind UI and
> the micro:bit simulator's sensors — along with the incidental `terminal` widget
> and the restore loop that emptied the panel behind it. Three lessons are
> re-measured and revised to content version 3. The one still open is the
> `microbitplus` no-ops, which are deliberate. Each section below says what
> changed; `docs/WAVE-OPEN-DEFECTS.md` carries the whole campaign's table.

Wave 4 is the third wave whose subject is not a circuit, and it needs a third
instrument. Wave 1–2 asked whether a **bench** can produce a reading and
answered by solving it; Wave 3 asked whether the app can **render** a language
and answered by generating it; Wave 5 asked what the **debugger** can show.
Wave 4's checkpoints ask whether a learner can **operate a control and see a
display** — a controller-panel widget, a micro:bit simulator, a LEGO hub — so
the subject under test is the interactive surface, and
`test/lesson-panel-claims-wave4.test.mjs` drives it: the real `ControllerPanel`
restored from the example's own `controller.json` the way
`pseudocode-importer.jsx` restores it, wired to the REAL scratch-vm by the real
`bindPanelToVariables`, with the program compiled by lite's own `sb3-creator`.
Where a virtual clock was needed the trace referee (`lib/trace-oracle.js`) ran
it, and the one circuit lesson was solved through `scripts/lesson-bench.mjs`.

The Tier-3 detector reported **0 blocking, 0 to review** on all eight lessons,
which is the correct answer to the question it asks (can the observable ever
fire, and does the *circuit* supply what the prose demands) and no answer at all
to this wave's question. Seven defects sat behind it.

## Verdicts

| lesson | example | v | verdict |
| --- | --- | --- | --- |
| interactive-extension-discovery | mb05-lesson | 2→**3** | **defect, fixed** — the green flag runs blocks that are all no-ops, and the "connection indicator" it names does not exist for this extension |
| interactive-sensor-capability | mb02-sensors | 1→2→**3** | defect, **FIXED 2026-08-24** — the sim pane now carries a sensor control per declared range; copy restored |
| interactive-lego-recovery | spike01-obstacle-avoid | 1→**2** | **defect (disclosure), fixed** — the hub path needs the Scratch Link helper, which the lesson never says |
| interactive-input-controls | retro-console | 1→2→**3** | defect, **FIXED 2026-08-24** — the inspector edits functional config, and the bench opens in play mode |
| interactive-displays | lego-hub-face | 1→**2** | **defect, fixed** — two of the values its checkpoint asks for cannot be produced by running the project |
| interactive-two-way-binding | mb05-faceplate-matrix | 1→2→**3** | defect, **FIXED 2026-08-24** — the inspector has a Binding section; "rename" is still a no-op by design and is now taught as the contrast |
| interactive-dashboard | lego-hub-face | 1 | achievable |
| interactive-calibration-control | arduino-03-calibration | 1→2→**3** | defect ×2, **BENCH FIXED 2026-08-29** — no filter existed to time; sb3-creator `1d2606b` gave the example a 4-tap boxcar, so `predict` asks for a prediction that can be checked. The dead actuator it also pointed at was repaired upstream mid-review |

Seven of eight. That is a higher rate than Waves 1, 3 or 5, and the reason is
structural rather than a sudden collapse in quality: six of the eight lessons
were written against a controller/simulator surface that is **younger than the
lesson copy**, in the same way Wave 5's three defects were all "the lesson
describes a richer debugger than the one that exists". Four of the seven are
one clause each; two (`interactive-input-controls`, `interactive-sensor-capability`)
ask for an observation that cannot be made at all.

## What works, measured, because a wave this defective needs its positives stated

The whole faceplate loop runs, end to end, in the engine the browser runs.
`mb05-faceplate-matrix`, driven through the real panel and the real VM:

```
green flag        screen =        1     matrix face =        1     (one dot)
hold A            screen = 18157905     matrix face = 18157905     (the X)
release A         screen =        1     matrix face =        1
hold B            screen =    31744     matrix face =    31744     (middle row)
```

which is `EXPECTED.md` to the digit. `retro-console` likewise: the D-pad reports
the bitmask its program documents (up 1, down 2, left 4, right 8), an opposite
pair reports **both** bits at once (up+down = 3), a button writes 1 on press and
0 on release, one step right moves the dot to `game_screen` = 2, FIRE latches
that cell into `trail`, and START restores px/py/trail/lives to 0/0/0/3. An
added joystick centres at (0, 0), corners at (100, −100) with a scalar readout of
141, and an added slider arrives with testable endpoints (0..100, step 1).

`lego-hub-face` over 4000 VM frames:

```
hub_matrix   exactly four values: 31744, 1118480, 4329604, 17043521
motor_angle  -180 .. 180      (both ends of its own gauge)
colour_id       0 .. 10       (both ends of its own gauge)
dist_cm        10 .. 190      against a 0..200 gauge  <- neither end
```

And `arduino-03-calibration`'s bench sweeps cleanly — `pot1.wiper` 0.0005 V,
2.5000 V, 4.9995 V at 0 %, 50 %, 100 % travel — while its program's calibrated
map lands exactly where the lesson tells the learner to predict:

```
sensor held at    0 (calibrated minimum)  -> sensorValue    0   outputValue    0 %   led duty   0
sensor held at  511 (midpoint)            -> sensorValue  511   outputValue   50 %   led duty  50
sensor held at 1023 (calibrated maximum)  -> sensorValue 1022   outputValue  100 %   led duty 100
```

with the clamp visible at both ends (a reading above the band is pinned to
`sensorMax` = 1022, one below it to `sensorMin` = 0), the D13 status LED going
on and then off exactly once, and 201 PWM writes reaching the green LED. That
last column is new: see defect 7 for what it read before.

## The defects

### 1. interactive-extension-discovery/inspect — the run it names produces nothing

`mb05-lesson` is `DEVICE MICROBIT`, and its `inspect` checkpoint said "**Run the
project**, find the extension's blocks, and mark which work in simulation, which
require hardware, and which offer a fallback", with the hint "Use the block
wording and **connection indicator** as evidence." The lesson's `observe` clause
is `project-run`, which `guided-lessons.jsx` maps to `bw-green-flag` —
dispatched by `containers/controls.jsx` and by nothing else.

Under the green flag, in the real VM with lite's real bundled extensions:

```
mb05-lesson   opcodes   microbitplus_showmatrix, _isbutton, _temp, _showtext, _light
              calls     microbitplus_showmatrix=1, microbitplus_isbutton=6
              variables changed: 0
```

and the extension's own source says why, in a comment written before this
review: *"these blocks lower to MicroPython … and run inside the micro:bit
simulator, NOT the Scratch VM stage — so the VM opcode methods are intentional
no-ops"*. Its sensors are literally `accel() { return 0; }`, `light() { return
0; }`, `temp() { return 0; }`. So "which work in simulation" cannot be read off
the run the checkpoint names: under the green flag, none of them do.

The evidence the hint names does not exist either. `microbitplus`'s `getInfo`
declares no `showStatusButton` — 0 occurrences, against 1 in `spikeprime` and 1
in `legospikeprimeBLE` — so Scratch renders no peripheral status button for it.

The real simulation surface is the Code tab's **▶ Run on Simulator**
(`data-testid="bw-microbit-flash"`), which generates MicroPython and flashes the
bundled WASM simulator. It does not fire `project-run`.

**Fixed** in copy, EN and DE, version 3: the checkpoint now has the learner run
both ways and compare, says plainly that the green flag runs no-ops, and points
at the block wording instead of an icon that is not drawn.

### 2. interactive-sensor-capability/observe — no simulated input could be varied — FIXED 2026-08-24

`mb02-sensors` reads accelerometer X, light level and temperature. The
checkpoint said "Run, **vary both simulated inputs**, and record minimum,
maximum, cadence, and any unavailable indication."

Under the green flag, after 40 frames of the real VM:

```
var ax  = 0      var lux = 0      var deg = 0
```

constant, because of defect 1's no-ops. There is no minimum, no maximum, and —
this is the sharper half — **no unavailable indication**: 0 is a legal light
level and a legal accelerometer reading, so a learner cannot tell "no device"
from "dark and level".

The simulator path is not better, and it is worse for being so close. The
bundled micro:bit simulator models these sensors *with their ranges, defaults and
units*:

```
new RangeSensor("temperature",  -5, 50,  21, "°C")
new RangeSensor("lightLevel",    0, 255, 127)
new RangeSensor("soundLevel",    0, 255,   0, …)
```

and accepts a `{kind: 'set_value', id, value}` message to move them —
`board.setValue(id, value)` with cases for `temperature`, `lightLevel`,
`accelerometerX/Y/Z` and `gesture`. The string `set_value` appears **nowhere in
lite's source**: `MicrobitSimPane` posts `flash`, `serial_input`, `stop` and
`reset`, and renders no sensor control. So on the simulator path the temperature
is 21 °C and the light level is 127, for ever.

The lesson asks for exactly the contract the simulator already declares — unit,
range, default — and the app is one slider row away from delivering it.

**Fixed** in copy, EN and DE, version 2 at the time: the checkpoint asked the
learner to establish *which* inputs they could change and what a missing device
looks like, stated the frozen values, and made "a flat 0 is a legal reading and
therefore not an unavailable indication" the finding to record.

**Then fixed in the app, 2026-08-24.** `MicrobitSimPane` now renders a Sensors
strip and posts `{kind: 'set_value', id, value}`. The controls are built from the
simulator's own `ready` frame rather than from a second declaration here — each
sensor arrives as a serialised `RangeSensor`/`EnumSensor` carrying
`{type, id, min, max, unit, value}`, so the range, unit and starting value on
screen are the ones the bundle implements and cannot drift from it. That is the
right shape for THIS lesson in particular, whose whole subject is reading a
sensor's contract off the thing that provides it.

Seven sensors and one gesture list: temperature (−5…50 °C, 21), light level
(0…255, 127), sound level (0…255, 0), three accelerometer axes in mg, compass
heading, and gesture. Deliberately not offered: buttons and pins, which already
have controls inside the iframe — a second, desynchronised set in the parent
would be worse than none. `↺ Defaults` restores the values captured from the
first `ready` frame.

Two details worth recording because both would have been silent failures. The
pane clamps before posting: `RangeSensor.setValue` THROWS out of range and the
simulator's message listener has no try/catch around its dispatch, so an
unclamped write would take the listener down and every later message with it.
And `state_change` frames are merged rather than replacing, because a program
can move a sensor itself (`setRange` rewrites the accelerometer's min/max) and
the controls must follow the simulator rather than assume they are the only
writer.

Version 3 asks the learner to move each sensor through its declared range and
record the values and the cadence. The finding that survives — and it is the
better half of the original — is that **no reading is reserved for "no device"**:
a flat 0 is a legal light level and a legal accelerometer value, so an
unavailable sensor has to be signalled some other way. The green-flag path is
named separately, because the micro:bit blocks are still VM no-ops there
whatever the sliders say (defect 1, still open).

### 3. interactive-lego-recovery/recover — the hub path needs a helper application

The observable is sound: `gui.jsx` turns `PERIPHERAL_CONNECTED` into
`bw-hardware-state` with `detail.state === 'connected'`, which is exactly what
the checkpoint matches on, and `spikeprime` emits it and declares
`showStatusButton: true`. The lesson is `optional-hardware` and offers an
explicit fallback ("otherwise trace the same state sequence manually"), so it is
achievable without a hub — the Wave 5 standard for an `optional-hardware`
lesson.

What it never says is how the hardware branch actually connects.
`spikeprime`'s transport is `runtime.getScratchLinkSocket("BT")` — Bluetooth
**Classic** through the Scratch Link helper application. There is no
`navigator.bluetooth` and no `navigator.serial` anywhere in the extension. A
learner with a SPIKE hub, a browser, and no Scratch Link installed will press
connect and get nothing, and the lesson gives them no way to know why. Its hint
already asked them to record the "OS", which is half of the same thought.

**Fixed** in copy, EN and DE, version 2: the hint now names Scratch Link and the
OS-level pairing. This is a disclosure fix in the shape of Wave 3's `asm`
finding, not a rewrite.

### 4. interactive-input-controls/predict — a toggle contract with no toggle — FIXED 2026-08-24

The `predict` checkpoint asked for "values for D-pad opposites, press/release,
**toggle twice**, and joystick centre/corners". Three of those four are on the
bench and were measured above. The toggle is not, and cannot be put there:

- `retro-console/controller.json` ships two buttons, both `"toggle": false`;
- the panel's **+ Add Widget** calls `panel.addWidget(name, type)` with no
  config (`controller-panel-view.jsx`, `_addWidget`), so every button it makes
  is momentary;
- the widget inspector edits **no functional config at all**. Its only
  `onConfig` calls are `color`, `fontSize`, `src` and `text` — the two
  decoration widgets. Name, label, colour, x/y/w/h/rotation and the style flags
  go through `onLayout`. A button's `toggle`, a slider's `min`/`max`/`step`, a
  gauge's `min`/`max`/`label` and a matrix's `rows`/`cols` are reachable only by
  editing `controller.json` by hand.

The behaviour itself is implemented and correct — a `{toggle: true}` button
latches on press, ignores release, and releases on the next press; measured. It
is only unreachable. Across the whole corpus exactly two shipped panels carry
one: `wedo2-faceplate` (`motorA`, `motorB`) and `boost-faceplate` (`go`, `dir`).

The `test` checkpoint holds up otherwise, and one of its instructions deserves
credit: "Use play mode for input and edit mode for layout changes" is exactly
right, because this panel opens in **edit** mode (defect 5b) where every control
renders `disabled`.

**Fixed** in copy, EN and DE, version 2 at the time: the prediction covered the
three contracts this console could show and sent the learner to `wedo2-faceplate`
or `boost-faceplate` for the toggle; the test hint said that + Add Widget always
makes a momentary button and the inspector could not change that.

**Then fixed in the app, 2026-08-24.** `WidgetInspector` has a Config section
driven by a `CONFIG_FIELDS` table: a button's `toggle`, a slider's and dial's and
gauge's and bargraph's `min`/`max`/`step`, a matrix's and keypad's and every text
display's `rows`/`cols`, a seven-segment's `digits`, an RGB light's `mode`. What
is deliberately NOT editable is named in `NON_FIELD_CONFIG_KEYS` with its reason,
so "not editable on purpose" and "nobody wrote an editor" are distinguishable —
which is the distinction that let the whole functional half go missing unnoticed.

The coverage is gated rather than trusted: `test/wave-open-defects.test.mjs`
checks the table against `WIDGET_DEFAULTS` (now exported from bw-board for this
purpose), so a widget type that grows a config key and no editor fails.

Version 3 asks for the toggle prediction on this console, because the learner can
now make one here. The mode disclosure is gone with it — `retro-console` ships
`"mode": "play"` as of the same day (defect 5b).

### 5. interactive-displays/observe — two of its four values cannot be produced by running

The checkpoint said "Run through **minimum, midpoint, maximum, and unavailable
values** and compare variables with every display", hinting "Check negative
motor direction and **gauge clipping** explicitly."

Measured over 4000 frames of the shipped program, the motor and colour gauges
reach both of their own ends and the distance gauge reaches neither (10..190 cm
against 0..200). More importantly, **no value the program writes can ever show a
clip**, because `setGaugeValue` clamps into `[min, max]` before the face sees
it — clipping is only visible when a variable is pushed outside a gauge's range,
which this program never does:

```
motor_angle := 1180   -> the motor face reads   180
motor_angle := -1180  -> the motor face reads  -180
dist_cm     := "n/a"  -> the distance face reads NaN
```

That last line is the whole "unavailable" story: a gauge clamps every *number*
into its range, so no numeric value can be reserved as an unavailable marker,
and the only face distinct from every valid reading is the `NaN` a non-numeric
variable produces. Nothing in the shipped run produces one, and the lesson never
told the learner they could write one.

**Fixed** in copy, EN and DE, version 2: the checkpoint now says to run through
each quantity's own range first and then edit the program to write a value
beyond a gauge's range and a non-numeric one; the hint gives the distance
gauge's 10-and-190 shortfall and explains what the clamp hides.

### 5b. Two faceplate examples shipped no play mode — FIXED 2026-08-24

`pseudocode-importer.jsx` restores a layout and then calls
`panel.setMode(layout.mode)` **only if the file says so**, and `ControllerPanel`
defaults to `'edit'`, where every input control renders `disabled`. Of the eleven
shipped `controller.json` layouts, four declare no mode — including
`retro-console` and `lego-hub-face`, which are the benches for four of this
wave's eight lessons. So those lessons open on a panel whose controls are dead
until the learner finds the Play button.

Not fixed at the time: the fix is one line per example (`"mode": "play"`) and the
examples are vendored from `sb3-creator`, so it belonged upstream. The display
widgets are unaffected — the variable pump ignores mode — which is why
`interactive-displays` and `interactive-dashboard` still worked on
`lego-hub-face`.

**Fixed 2026-08-24, in three places, because one was not enough.** All four
layouts declare `"mode": "play"` upstream (sb3-creator `65db1dd`), with
`test/faceplate-layouts.test.mjs` as the schema gate those files never had: every
layout with an operable control must open in play mode. But the panel's own
`toJSON` did not serialise the mode and `fromJSON` did not apply it, so the
corrected file would have been lost on the first save; and `gui.jsx`'s
`PROJECT_LOADED` restore never called `setMode` at all, so a saved project came
back in `edit` regardless. Both are fixed. A layout written before the field
existed still restores as `edit`, which is what it means.

### 6. interactive-two-way-binding/test — "rebind" had no UI, and "rename" is a no-op — FIXED 2026-08-24

Both directions of this lesson's loop work, and were measured above. Its second
instruction was "then **rename or rebind** one widget and retest", explained as
proving "recovery from configuration change". Neither half does that:

- **Rebind has no UI.** `bindToVariable`, `bindToPart` and `bindToPin` are
  called from nowhere in the GUI. The only binding call the app makes is
  `bindToProgram`, inside `_addWidget`. `WidgetCard` is even handed an
  `onBindPart` prop, and never uses it.
- **Rename changes nothing.** `renameWidget` rebuilds the name map and sets
  `w.name`; `w.binding.variableName` is untouched by design. Measured: after
  renaming `a` to `buttonA`, the binding is still
  `{target: 'variable', variableName: 'btnA'}` and the loop keeps running.

There *is* a configuration change with a real and instructive consequence, and
the app makes it in one click. Remove a widget and add it back: **+ Add Widget**
binds the new one to the *program*, not to the variable the old one wrote, so
the loop stays broken until the example is reloaded. Measured — after
remove-and-re-add, pressing the button leaves `screen` at 1.

**Fixed** in copy, EN and DE, version 2 at the time: the action became
remove-and-re-add, and the hint stated both facts — renaming keeps the binding, a
re-added widget is program-bound — so the learner's own test told them who owns
the arrow.

**Then fixed in the app, 2026-08-24.** The inspector has a Binding section: a
target selector over the five the model implements (program, variable, part, pin,
unbound), a variable field backed by a datalist of the stage's own variable names,
a part picker over the board's part ids with a param field, and a pin field. It
calls `bindToVariable`, `bindToPart`, `bindToPin`, `bindToProgram` and `unbind` —
the methods that had existed since the model was written and were called from
nowhere. Re-binding a display also rebuilds the board binding, because the pump
only writes on CHANGE and a newly bound face would otherwise hold the old
variable's last reading until the new one happened to move.

Version 3 makes re-binding the action and keeps both original facts as the
contrast: renaming keeps the binding so the loop survives, and a re-added widget
is program-bound so it breaks until you re-bind it by hand. `WidgetCard`'s unused
`onBindPart` prop is gone with it.

### 7. interactive-calibration-control — no filter to time, and (until mid-review) a dead actuator

Two separate faults, one lesson. The second of them was repaired upstream by
another lane while this review was being written, which is worth recording in
full rather than quietly deleting: it is the second time in this campaign
(Wave 2 was the first) that a measured defect was fixed at the source before the
review shipped.

**The `predict` checkpoint asked the learner to "estimate filter delay in
samples and seconds", and there was no filter.** `arduino-03-calibration`'s
program calibrated, clamped and mapped; it contained no moving average, no
window and no N. Measured with the trace referee, stepping the sensor 0 → 1023 at
t = 8000 ms:

```
horizon 7990 ms -> sensorValue    0   outputValue   0
horizon 8000 ms -> sensorValue 1022   outputValue 100
```

The mapped output arrived complete at the first sample after the step: zero
filter delay, one pass of its 20-millisecond loop. The learner's estimate had
nothing to check it against. Version 2 of the lesson worked around that:
`predict` asked the learner to *choose* a moving-average length and say what
delay it would cost, stating that this program has none.

> **FIXED 2026-08-29** (sb3-creator `1d2606b`), and version 3 undoes the
> workaround. The program now runs a **4-sample moving average**, written as four
> VARIABLES rather than a list — list operations lower to `0 /* item */` on the
> device, so a list filter would have been a no-op on real silicon and a worse
> lesson than no filter at all. Re-measured here through lite's own trace
> referee, calibrated over the full span and stepped 0 → 1023 at t = 8000 ms:
>
> ```
> horizon 7990 ms -> outputValue   0     window 0, 0, 0, 0
> horizon 8000 ms -> outputValue  24     window 1023, 0, 0, 0
> horizon 8020 ms -> outputValue  49     window 1023, 1023, 0, 0
> horizon 8040 ms -> outputValue  74     window 1023 x 3, 0
> horizon 8060 ms -> outputValue 100     window 1023 x 4
> ```
>
> Settling time is window × loop period = 4 × 20 ms = **80 ms**; the group delay
> of an N-tap boxcar is (N − 1) / 2 = 1.5 samples = **30 ms**. Both are
> properties of the window and the loop period, not of this step.
>
> **One caveat, found by measuring rather than by copying the numbers.** The
> staircase reads 24/49/74/100 only when the calibration sweep reaches BOTH
> rails. The stimulus this review's own gate had been using peaks at 1022, which
> makes `sensorMax` 1022 and the middle two steps read **50 and 75** instead —
> 511/1022 is exactly 50 %, 511/1023 is 49.95 % and truncates to 49. That is
> arithmetic, not a defect, but a lesson that quotes 49 and 74 needs a bench
> calibrated to 1023, so the gate now clips a larger sine instead of scaling a
> smaller one.
>
> `predict` v3 asks for the settling time and the lag, and then asks the learner
> to measure both. The v2 hint said the opposite of what is now true — "This
> program has no filter at all" — which is exactly the kind of sentence a
> workaround leaves behind when its defect is repaired somewhere else.

**The `test` checkpoint pointed at an actuator the program did not drive — and
now does.** As measured on `2e294ceaf`, the program's `set pwm led to
outputValue` line was not a pin form — the parser wants `PIN led = D9 PWM` and
`set led to <n> percent` — so it fell through to the generic variable assignment
and created a variable literally named `pwm led`:

```
pwm writes: 0        vars: { …, outputValue: 255, "pwm led": 255 }
pin events: statusled only  (on at t=0, off after the 5 s calibration window)
```

This was the known write/read-split class, and `arduino-03-calibration` was
**not** on `test/example-execution.test.mjs`'s `KNOWN_BROKEN` list of thirteen
examples with the same defect. It passed that gate because it also drives D13,
and "programs with output pins produce at least one pin event" is satisfied by
the status LED while the real actuator is inert. That is the gate hole the
finding actually exposed.

`d7325a272` ("vendor sb3-creator@1a83dfa, and take four waiver lists to zero")
repaired it at the source along with nineteen sibling programs, and took
`KNOWN_BROKEN` from thirteen to zero. Re-measured on that tree:

```
pwm writes: 201      outputValue 0 / 50 / 100 at the minimum, midpoint, maximum
last write: {pin: "led", percent: 100}
```

Note the unit change that came with the repair: `percent` is 0..100 where the
Arduino original's `analogWrite` is 0..255, so the mapped values a learner
predicts are now 0 / 50 / 100 rather than 0 / 127 / 255. The lesson's `test`
checkpoint accordingly watches `sensorValue`, `outputValue` **and** the green
LED, and its hint states the duty relationship.

What did not change: the program still has no plausibility check and no defined
safe state, so "verify … safe output" remains something the learner must
specify rather than observe. Version 2 asks for exactly that.

### 8. `6502-terminal` declared a widget type the panel did not have — FIXED 2026-08-24

Found while auditing the eleven shipped controller layouts; no Wave 4 lesson
uses it, so it changes no verdict here and is recorded so a later wave does not
rediscover it. `6502-terminal/controller.json` declares
`{"name": "screen", "type": "terminal"}`, and `terminal` is not in
`ControllerPanel`'s `DEFAULTS`, so `addWidget` throws `Unknown widget type`. The
importer's restore loop removes every existing widget *before* adding the new
ones and is wrapped in a bare `catch`, so the throw on the first widget leaves
the panel **empty** — the keyboard widget that would have followed never
arrives either.

**Fixed 2026-08-24, on both sides, because either alone would have been half a
fix.** `terminal` now exists: an OLED-like text face, but **tail-anchored**,
because a terminal's bound variable is a growing transcript (`6502-terminal`'s
`serial_out` grows with every echoed keystroke) and head-anchoring would freeze
the face on the first screenful and never show the prompt the learner just typed
at. Long lines wrap rather than truncate, for the same reason: the end of a line
is the part being read.

And **both** restore loops — the importer's and `gui.jsx`'s — now guard each
widget individually, so one type the model refuses costs that widget and not the
panel. The importer reports what it skipped in its status line rather than
failing silently. That is the durable half: a bare catch around a loop that has
already cleared its target is a defect independent of which type happened to
trigger it.

Two more holes fell out of the same audit and are closed: `lcd`, `oled` and
`keypad` were in `WIDGET_TYPES` with no `WIDGET_RENDER_INFO` entry, so a host
reading `renderInfo[type]` got `undefined` and invented a size. bw-board's gate
now requires every declared type to have both a default config and a render
descriptor, and lite's requires every type any shipped layout declares to be one
the panel has.

## interactive-dashboard, and why it is the one that holds up

Its `evaluate` checkpoint — "Rearrange or relabel the panel, then test normal,
warning, fault, and stale-data scenarios" — reads at first like
`interactive-displays`'s problem, since the panel has no alarm rule and the
program declares no fault. It survives because every scenario it names is
reachable on the shipped bench once the learner defines what they mean:

- **rearrange** is edit-mode drag plus the inspector's x/y/w/h fields;
  **relabel** is `layout.label`, which the inspector does edit;
- **normal** and **warning** are both on the sweep: `dist_cm` runs down to
  10 cm, so any plausible proximity threshold is crossed twice a cycle;
- **fault** has a shipped value — `colour_id` reaches 10, which the program's
  own comment documents as the LEGO palette's *none*, i.e. no colour detected;
- **stale data** is one click: press stop and every face holds its last value
  with nothing to say it is old, because the pump only writes on change.

That is four scenarios from the project as shipped. Its `predict` checkpoint is
a design exercise with no bench demand at all.

## Checkpoint ledger

Every checkpoint in the wave, and how it was settled.

| checkpoint | settled by |
| --- | --- |
| interactive-extension-discovery/predict | off-bench (list expected capabilities) — no bench demand |
| interactive-extension-discovery/inspect | **defect 1**, measured in the VM + extension source |
| interactive-sensor-capability/predict | off-bench (write two sensor contracts) |
| interactive-sensor-capability/observe | **defect 2**, measured in the VM + simulator bundle |
| interactive-lego-recovery/predict | off-bench (define safe disconnect behaviour) |
| interactive-lego-recovery/recover | **defect 3**, producer + transport read from source; `optional-hardware` fallback verified |
| interactive-input-controls/predict | **defect 4**, measured on the real panel |
| interactive-input-controls/test | achievable — every shipped control driven end to end |
| interactive-displays/predict | off-bench (design three display contracts) |
| interactive-displays/observe | **defect 5**, measured over 4000 frames + clamp probes |
| interactive-two-way-binding/predict | off-bench (draw the two directed paths) |
| interactive-two-way-binding/test | **defect 6**, both directions measured; rename/rebind measured |
| interactive-dashboard/predict | off-bench (rank indicators by urgency) |
| interactive-dashboard/evaluate | achievable — all four scenarios reachable, see above |
| interactive-calibration-control/predict | **defect 7a**, step response measured by the referee |
| interactive-calibration-control/test | **defect 7b**, clamp measured; 0 PWM writes measured, then 201 after the upstream repair |

Nothing is left unverified. The four `predict` checkpoints that are marked
off-bench are genuinely off-bench — each asks the learner to write a prediction
before touching anything, which is the one checkpoint shape this method cannot
and need not test.

## The language matrix, generated not assumed

Twenty-one declared variants across eight lessons; all render from each lesson's
own example through the same `sb3-creator` the browser bundles.

```
lesson                            example                  variants
interactive-extension-discovery   mb05-lesson              blocks 16b   pseudo 17L
interactive-sensor-capability     mb02-sensors             blocks  9b   pseudo 10L   python 37L   js 31L
interactive-lego-recovery         spike01-obstacle-avoid   blocks 16b   pseudo 17L   python 129L  js 38L
interactive-input-controls        retro-console            blocks 104b  pseudo 93L
interactive-displays              lego-hub-face            blocks 43b   pseudo 68L
interactive-two-way-binding       mb05-faceplate-matrix    blocks 11b   pseudo 18L
interactive-dashboard             lego-hub-face            blocks 43b   pseudo 68L
interactive-calibration-control   arduino-03-calibration   blocks 31b   pseudo 32L   c 158L
```

No Wave 3-style gap here: nothing is empty and nothing throws.

## What I could not check

- **No browser.** Every panel measurement was taken through the same model
  objects and the same wiring calls the browser makes (`ControllerPanel`,
  `bindPanelToVariables`, the importer's restore sequence), not through a
  rendered page. That is decisive for the value contracts and the bindings —
  they are model behaviour — and it is *not* decisive for anything about
  layout, hit targets, or whether a control is comfortable to operate.
- **The `pump` cadence.** In the browser the display direction is polled by
  `requestAnimationFrame`; node has none, so the gate pumps once per VM step.
  Same function, same call order, different rate. No claim here depends on the
  rate.
- **The micro:bit simulator itself was never run.** Its sensor ranges and its
  `set_value` handler were read out of the shipped bundle; what was measured is
  that lite never sends the message. If some other surface sends it, defect 2
  softens — the pinned test fails the day it does.
- **No hub, no Scratch Link.** Defect 3 is a source reading of the transport,
  not an observed failure to connect.
- **The German copy** was written alongside the English and is not independently
  reviewed.
- **Pedagogy**, including whether a colour ID belongs on a gauge at all, and
  whether a wave about interactive systems should be taught on a panel this
  young. Six of its eight lessons describe a surface slightly richer than the one
  that exists — the same finding Wave 5 recorded about the debugger.

## Reproducing this

```
node --test test/lesson-panel-claims-wave4.test.mjs
```

Five of its tests were named `OPEN DEFECT` and asserted that a defect **still
reproduces**: the missing toggle config editor, the absent re-bind UI, the
micro:bit no-ops, the frozen simulator sensors, and the mode-less faceplates.
They were supposed to fail the day someone fixed the app or the example; each
message named the lesson hint to soften and this document to update. A sixth was
written for the calibration example's dead PWM line and had already been
replaced by a positive assertion — the repair landed before this branch did.

**Four of the five have now fired**, on 2026-08-24: the config editor, the
re-bind UI, the simulator sensors and the faceplate mode. All four were retired
per their own instructions and replaced by positive assertions in
`test/wave-open-defects.test.mjs`, which also re-derives this document's counts
from the wave JSON. The one still standing is the micro:bit no-ops, which are
deliberate and documented in the extension itself — see
`docs/WAVE-OPEN-DEFECTS.md` D30 for what closing it would mean.
