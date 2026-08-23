# Tier 2.1 — declared pins ≡ wired pins: what the gate found

`test/declared-pins-wired.test.mjs`, added 2026-08-23. Covers all 267 index
entries with no per-example authoring. Needs **no sibling checkout**: it runs
against the engine lite vendors, so it cannot skip in CI.

## The invariant, and what "wired" means

A pad is **wired** when the vendored engine puts its terminal in a resolved net
with at least two distinct real terminals. It is not a walk over `wires` —
sb3-creator's `test/rail-short.test.mjs` records why a hand-rolled union-find
reported 802 shorts in 2,040 files: endpoints come in two dialects mixed within
one file, and breadboard topology lives in the engine.

**deviceOnly examples.** A micro:bit or A2 faceplate program is a self-contained
board; its pads are on the PCB and there is no circuit to wire them into. Those
21 examples carry no circuit, so the gate does not ask whether their pads are
wired. It asserts the equivalence instead — **no circuit ⟺ deviceOnly** — which
is what turns "an intro promising a display for an example with no circuit at
all" into a caught defect. All 21 currently satisfy it.

## Findings — 21 defects in 20 examples, and which side is wrong

### A. The circuit is wrong: declared components are simply absent (13)

`arduino-sk-p03` · `p04` · `p05` · `p06` · `p07` · `p08` · `p09` · `p10` · `p11`
· `p12` · `p13` · `p14` · `p15`.

The circuit is a bare board plus power. `arduino-sk-p14-serial-pot`'s
`circuit.json` is an `arduino_uno`, a `vcc` and a `gnd` — no potentiometer,
though the program declares and reads one on A0. `p11-crystal-ball` is the same
shape. **Program and intro are right; the circuit is missing its components.**

Checked with bw-bundle rather than assumed: its in-flight repair changes a pin's
MODE (`OUTPUT` → `PWM`/`TONE`) and the actuation verb, and **wires nothing** —
`p05-servo-mood` still has no servo afterwards. So these are not "already being
fixed"; only the mode string moves, and this gate keys on the pad.

### B. Pin-purpose conflict, not an omission (1) — lesson-visible

`eater6502-full-build` declares `led0..led7` on `PA0..PA7`. **`PA5`/`PA6`/`PA7`
are wired to the hd44780's `rs`/`rw`/`e`**, so the program driving "LEDs" there
would scramble the LCD, and `PA0..PA4` are wired to nothing. Its `bargraph` part
carries **zero wires**. Two findings, one example: a conflict and an omission.

**Both sides need a decision** — either the program moves off the LCD control
lines, or the circuit wires the bargraph and the LCD moves. Named by the lesson
`machines-memory-maps` (wave 7), so it is learner-visible; bw-lessons asked for
this write-up rather than re-deriving it.

### C. The circuit substitutes a part the intro promises (3) — one root cause

`03-night-light` · `16-ldr-bargraph` · `arduino-sk-p06-light-theremin` each
declare `PIN ldr = … ANALOG`, and each has a **potentiometer** on that pad and
no LDR. Both intros promise "a light-dependent resistor (LDR)" and tell the
learner to *cover it with their hand*.

Not three authoring slips — one **generator** choice. The part arrives literally
named `POT_ldr`: bench synthesis maps an ANALOG pin to a potentiometer whatever
the pin is called. An `ldr` kind exists in `src/parts-data/ldr.json`, so this is
a substitution, not a limitation. **Fix the synthesis and all three clear.**

Why nothing caught it before: a pot and an LDR are both a resistance to the ADC,
so the bench reads a plausible number and only the teaching is wrong. A
wired/unwired check passes it — the pad *is* wired. It needs the name-vs-kind
check.

### D. The circuit ships a control nothing reads (4)

`arduino-02-blink-without-delay:btn1` — a button fully wired to `d2` that no
program reads. bw-bundle proved the program is correct (its first write sits
behind a 2.5 s wall-clock gate), so **the circuit is wrong**: either the program
should read the button or it should carry a `decorative` marker. Named by the
lesson `debug-timing-bugs` (wave 5). This is the case the owner found by hand;
the gate reproduces it independently.

`61-console-pong:s1` · `s4` · `s5` — buttons on `p3.0`/`p3.7`/`p3.6`, undeclared.

### E. Not a defect (1)

`pico01-blink:led1@GP25` — the Pico's onboard LED is on the PCB. Confirmed at
the model level, not just by convention: bw-board's `board.js` synthesises the
onboard-LED net for a seated `pi_pico` whether or not `gp25` is wired.
Allowlisted with that reason, separately from the ratchets.

## Two false-positive classes the detector had first

Recorded because both looked exactly like corpus findings:

- **Pads are not only on the MCU.** eater6502 reaches `PB0..PB7` through a
  W65C22 VIA. Keying on MCU-kind parts reported 8 false unwired pins on a
  correctly wired bench.
- **Power legs are not pads.** Counting the MCU's own `GND`/`VCC` terminals made
  every LED whose cathode meets ground look like it sat on a declared pin — **96
  false positives, which collapsed to 4** once rails were excluded. An LED behind
  a 74HC595 is driven indirectly and its net never touches a pad at all; the gate
  therefore says nothing about those rather than guessing.

Per bw-audit's rule, the gate now asserts **its own yield first** — that the walk
found ≥200 examples, ≥100 with declared pins, ≥200 resolving a non-empty netlist
— because a detector that matches nothing makes every later assertion pass
vacuously and looks exactly like success.

## Mutation proofs

| mutation | result |
| --- | --- |
| repoint a declared pin to an unwired pad (`01-blink` P1.0 → P2.7) | RED (2 checks), restored green |
| delete a ratchet entry so its defect resurfaces | RED, restored green |

Both applied to the files the gate actually reads, with save-before and restore,
and each verified to have changed the file — a mutation that changes nothing
scores a phantom pass.

## Scope, stated rather than implied

**Which engine.** The one lite vendors, which is the engine lite ships, so a
defect here is a defect users get. The cost, raised by bw-audit from the stc12
gap: a vendored-against-vendored comparison cannot see the vendored copy going
stale. Measured 2026-08-23 — lite's vendored `examples/` is **19 `program.bw`
files behind sb3-creator `main` (25665d9)** but **byte-identical to the
`db2966f` pinned in `vendor-pins.json`**. So lite is self-consistent with its own
pin; the lag is a pin-bump decision owned by `sync-examples.mjs` and gated by
`test/vendor-manifest-contract.test.mjs`, not by this gate. None of the findings
above depend on it: bw-bundle's upstream change alters pin modes, and this gate
keys on pads.

**What it does not check.** Whether a driven pad does anything at the far end.
bw-bundle reports `b.setDeviceControl(...)` is called in the devices extension
and defined nowhere across bw-board, bw-circuit-ui, sb3-creator and lite's
overlay, which would make the whole actuator surface (`lcdprint`, `lcdcursor`,
`lcdclear`, `setneopixel`, `setservo`, `setmotor`, `setdirection`) a
truthiness-guarded no-op in the simulator path. An example can pass this gate and
still drive nothing. **That is the Tier 2.2 this points at** — I have not
verified the claim myself.

## Ratchets may only shrink

Three lists — `KNOWN_UNWIRED`, `KNOWN_UNREAD`, `KNOWN_UNCONNECTED`, plus
`KNOWN_KIND_MISMATCH`. Each asserts in both directions: an unlisted defect fails,
and a listed entry that no longer reproduces fails too, so a fix must delete its
entry in the same commit. A canary asserts every ratchet key names a real
example, so the lists cannot quietly excuse nothing.
