# The nightly corpus differential and `arduino-sk-p14-serial-pot -> nano`

Captured 2026-09-10, when the `Nightly corpus differential` failed at `main`
sha `a2af23c1e`. This records the exact failing evidence, the diagnosis, and
the fix — because the gate that found it is a rotating-sample gate and the
finding is perishable: the sample rotates by day-of-year, so the day the
rotation moves off these programs the gate goes green with nothing fixed, and
the failing programs' names go with it.

## What failed, and what did not

The rotation's offset that day was `dayOfYear * 6 = 1518`, which selected six
pairs — three Arduino-starter-kit programs on both nano and pico. Only **one**
of the six actually disagreed:

```
arduino-sk-p12-knock-lock -> nano: AGREE
arduino-sk-p12-knock-lock -> pico: AGREE
arduino-sk-p13-touch-lamp -> nano: AGREE
arduino-sk-p13-touch-lamp -> pico: AGREE
arduino-sk-p14-serial-pot -> nano: DIFF   <-- the only one
  serial 70: "31" vs "870"
  serial 71: "31" vs "870"
  serial 72: "31" vs "870"
arduino-sk-p14-serial-pot -> pico: AGREE
```

The hosted CI log only says the subprocess exited non-zero; the detail above is
from a local reproduction in a clean `origin/main` worktree (`node_modules`
symlinked, `EXAMPLES_DIR` pointed at `overlay/scratch-gui/examples`), running
`node scripts/oracle-differential.mjs corpus 6 1518` against the hosted
compiler `https://stc-compiler.vercel.app`.

## Why it is a WHEN, not a WHAT — the timestamped proof

`arduino-sk-p14-serial-pot` is `forever: print read pot; wait 0.01 seconds`.
The differential's sweep holds the pot at its low reading (0.15 V -> ADC 31 on a
10-bit part) until t=900 ms, then its high reading (4.25 V -> ADC 870). Serial
lines are compared by INDEX. The referee prints on a free virtual clock; the
device pays real serial time. Timestamped, line index 65-77:

```
REF (referee): 650=31 660=31 670=31 680=31 690=31 700=31 710=31 720=31 730=31 ...   (10 ms cadence, 251 lines to t=2500)
ACT (nano):    845=31 858=31 871=31 884=31 897=31 910=870 924=870 938=870 ...        (~14 ms cadence, 187 lines to t=2489)
```

The nano's 9600-baud blocking UART drifts ~3 ms per line, so by line 70 it has
reached t=910 ms — past the 900 ms sweep transition — and correctly reads 870,
where the referee's line 70 (at t=700 ms) correctly reads 31. **Both read the
pot correctly for the moment each sampled it.** The pico's 16-deep FIFO keeps
cadence, so its line 70 is still pre-transition and it agrees. The comparator
misreads this as a `value` disagreement because it aligns serial by index; the
251-vs-187 `count` difference is the same cause (a slower printer emits fewer
lines in a fixed horizon, still printing at t=2489 of a 2500 ms horizon).

## The fix

1. **A permanent regression anchor.** `test/corpus-differential.test.mjs` now
   runs `p12-knock-lock`, `p13-touch-lamp`, `p14-serial-pot` on both devices
   EVERY run (via `oracle-differential.mjs cases …`), in addition to the
   rotating sample. A regression on them is caught the run it appears, not once
   every ~37 days — closing the "a rotating-sample gate cannot tell fixed from
   not-sampled" hole (the same family as a moved skip).

2. **A narrow, program-justified forgiveness** in `scripts/corpus-cadence.mjs`.
   `p14-serial-pot` is listed as a pure passthrough — `forever: print read
   <input>`, no logic between the read and the print — so a serial disagreement
   that (a) shows the SAME SET of readings on both sides and (b) has both
   streams running to the horizon can only be cadence, never a wrong value. The
   gate reclassifies it as a stated SKEW rather than a DIFF. This is derived
   from a property of the PROGRAM, not the streams; it is **falsified** if the
   program ever gains logic between the read and the print, at which point the
   entry must be removed. `test/corpus-cadence.test.mjs` proves it in both
   directions: a reading the referee never produced still fails, an early stop
   still fails, and an unlisted (logic-bearing) program is never forgiven.

## What was deliberately NOT done here

The general sound rule is time-alignment — match each actual serial line
against the referee value at ITS OWN timestamp, rather than by index. That
belongs in the comparator (`compareTraces` in `trace-oracle.js`), which is
vendored from sb3-creator, so it goes upstream as a proposal rather than a lite
fork. The run-length-collapse rule (forgive when the two streams collapse to the
same ordered distinct values) was considered and rejected: it is justified by a
property of the streams and forgives a real defect class — a logic-bearing
program whose transition fires on the wrong line due to a bug collapses to the
same values, and no value-only test can separate that from cadence drift.
