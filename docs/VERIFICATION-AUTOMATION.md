# Verifying the corpus by machine, not by reading it

*Internal technical doc, English-only (per the bilingual rule: learner-facing
docs are EN/DE, implementation contracts stay English). Written 2026-08-23.*

This is the execution plan for `PLAN.md`'s Milestone 0. It exists because the
obvious approach — put agents on the corpus and have them read 275 examples and
79 lessons one at a time — is the wrong shape for the problem, and we can now
show that rather than assert it.

## The measurement that decides it

`sb3-creator/test/assert-physics.test.mjs` already parses machine-readable
fenced blocks out of `EXPECTED.md`:

```
net <label> V <expected> +-<tolerance>
pin <name> duty <expected> +-<tolerance>
current <partId> mA <expected> +-<tolerance>
```

Measured on 2026-08-23:

| | |
|---|---|
| example directories | 275 |
| with an `EXPECTED.md` | 274 |
| with a machine-readable ```assert block | **244** |
| assertions the parser found | 357 |
| **checked** | **242** |
| **skipped — "unknown assertion kind"** | **115** |

**115 claims are already written down in a machine-readable format and are not
checked.** Not missing, not vague — written, parsed, and then skipped, because
the parser knows three kinds and the corpus uses many more: `display:`,
`interface:`, `text_line_0:`, `refresh_ms:`, `tick_ms:`, `pulse_duration_ms:`,
`buzzer_tone_hz:`, `audio_context:`, `led_idle:`, `led_during_pulse:`,
`counter_row:`, `widgets:`.

That is the same failure shape as a gate that cannot fail (`ROADMAP.md` §5, and
the five instances in `sb3-creator/test/GATE-AUDIT-REPORT.md`): the intent is
recorded, the verification is not, and the run is green either way.

## Why one-by-one is the wrong shape

Every defect found in the 2026-08-22/23 sweep was an **instance of a class**, and
every class became cheap to detect the moment it was named:

| defect | found how | class |
|---|---|---|
| `set variable X to Y` assigns a variable *named* "variable X" | detector | write/read split |
| `set pwm <pin> to N` makes a variable named "pwm led" | detector | same shape, different verb |
| `oled cursor`, positional `set neopixel` — verbs that do not exist | `bw check` warnings | unknown verb |
| eleven `devices_oled*`/`devices_tft*` opcodes no extension defines | execution gate | undefined opcode |
| a program declaring output pins that never reaches hardware | execution gate | inert program |
| LEDs on P1 while the STC12's ADC *is* P1 | read by hand | pin capability |
| `btn1` wired to D2 that no program reads | pedagogy audit | decorative affordance |
| a "light theremin" whose circuit has no LDR | read by hand | program/circuit mismatch |
| `serial_in != lastChar` swallowing repeated keys | **executing it** | logic defect |

The reading pass found two defects in seven lessons. A checkpoint-achievability
detector scans all seventy-nine in seconds. Reading does not scale, and worse,
it is unreliable in exactly the cases that matter: the repeated-key bug survived
a careful read and a clean `bw check`, and died the moment the program was run.

**So: build the detector, then batch-fix what it flags. Read only the residue.**

---

## Tier 1 — extend what already exists

Highest leverage, least new machinery: the authoring is already done for 244
examples.

Teach the assert parser the rest of the vocabulary, roughly in frequency order.
Each new kind verifies many examples at once.

- **display / interface / `text_line_N` / `counter_row`** — run the program in
  the VM and read the display buffer.
- **timing: `refresh_ms`, `tick_ms`, `pulse_duration_ms`** — frame counting
  against the cooperative scheduler's tick.
- **`led_idle` / `led_during_pulse`** — pin state sampled over time, which the
  execution gate already collects.
- **audio: `buzzer_tone_hz`, `audio_context`.**
- **`widgets`** — the `controller.json` contract; `verify-lego-hub-faces.mjs`
  already does this for four faceplates and generalises.

Target: 115 skipped → 0, with any genuinely uncheckable kind failing loudly as
unsupported rather than skipping quietly.

## Tier 2 — invariants that need no per-example authoring

These scale to all 275 for free, because they are derived from artifacts that
already exist rather than from expectations someone has to write.

1. **Declared pins ≡ wired pins.** Every `PIN x = P2.1 OUTPUT` in `program.bw`
   must be wired in `circuit.json`; every affordance part (button, pot, switch)
   must be read or driven by the program, or carry an explicit `decorative`
   marker. One gate catches four classes seen today: a missing circuit, a
   decorative `btn1`, a wrong pin, and an intro promising a display that is not
   in the circuit.
2. **Device pin capability.** `PIN pot = P2.0 ANALOG` is invalid on an STC12 —
   the ADC is P1 only. The device model already knows each pin's capabilities;
   this is a lookup. Would have caught the `disp-bargraph` conflict for free.
3. **Cross-target differential.** Transpile each example to every target it
   declares and assert the *set of hardware calls and pin writes* is identical.
   Divergence is an emitter bug, and no expectations need writing.
4. **Metamorphic solver checks.** Double a resistor and assert the current
   halves; raise the supply and assert node voltages scale. Catches solver
   regressions without needing absolute truth, and complements the
   lcapy oracle rather than duplicating it.

## Tier 3 — lessons

The lesson format was designed in a way that makes this checkable, and `PLAN.md`
says so explicitly: checkpoint conditions come from a small **declarative**
vocabulary (`starter-loaded`, `project-run`, `project-stop`, `circuit-ready`,
`circuit-changed`, `debug-phase`, `hardware-state`) — "never arbitrary code from
lesson data".

1. **Checkpoint achievability.** For each checkpoint, ask mechanically whether
   its condition can ever become true on the example it names. The diode lesson
   asked for alternating input/output traces from a *static* polarity bench; one
   solve shows that node never moves. The capacitor lesson asked for discharge
   from a charge-only bench. Both were found by hand, in the first seven
   lessons reviewed. This finds the rest.
2. **Lesson ↔ example contract.** Every value a lesson quotes in prose must
   appear in that example's assert block, or be derivable from it. This is how
   "teaches a number the bench does not produce" gets caught across all 79
   without reading them.

---

## What stays human

Not everything here is mechanisable, and pretending otherwise would produce the
same false confidence this document exists to remove:

- whether the pedagogy is sound, and whether this example is the right vehicle
  for this concept;
- prose quality, and the German translations;
- **deciding which side to fix** when a check fails — the example, the engine,
  or the lesson. `disp-oled` failing could mean a bad example or a missing verb;
  it was the verb;
- the first instance of any novel class. Detectors are written from named
  classes, and something has to name them.

## Rules for anything built from this document

- **Mutation-prove every detector.** Re-introduce the exact defect it guards,
  confirm red, restore. A detector that has never failed is not evidence.
- **Verify the instrument, not just the subject.** This project has lost time to
  a mutation applied through a symlink that never reached the module the import
  resolved to, and to an A/B whose "before" side ran with an uninitialised
  device registry and invented a 44-circuit blast radius that never happened.
- **A skip is not a pass.** Where a check cannot run, it must say so loudly in
  the environment where it cannot — see `ROADMAP.md` §5.
- **Ratchets only shrink.** Fixing an entry removes it in the same commit.
