## Intermittent green-flag first-write failure on main — 2026-10-11

DONE candidate — Claude (opus), owner request ("take it on, fix it all"), branch
`lane/green-flag-transient-20261011`. Since the bw-board pin `09c0f027`
(winding repair adoption), `scripts/verify-green-flag-first-write.mjs` runs 5
and 6 fail in about 3 of 5 hosted light-shard runs: the designer reports
"Simulation stopped: advanceToLive refuses failed transient history", its clock
does not run and the first write is lost. No lane owned it. This lane
reproduces it, finds the cause in the pinned engine/UI pair or in Lite's
wiring, and fixes it at its origin (own forks bw-board / bw-circuit-ui with a
pin move, or Lite), without weakening the journey's assertions or bounds.
Envelope: the files the diagnosis implicates, the pin and its ripple surfaces,
this ledger.
Cause was in the engine, fixed upstream in bw-board PR #496 (merged
`9c8777d5`): on the 54-motor-driver bench a short first advance left the
trapezoidal inductor history out of step with the motor's back-EMF, so full
and half steps disagreed by 0.92 mV at every step size down to the 1e-15 s
floor (error 42.7, the same as in the failed CI runs) and advanceToLive refused
the run; reset() also carried the old step seed, history, latch and motor
speed into the next run. interactive-v2 now restarts the history once at such
a floor step, and reset() starts fresh. This lane moves the pin to `9c8777d5`
with every pin-derived surface; the delta also brings other qualified master
work (winding turn-off and RLC instrument oracles, reactive live-span
scheduling). Local: the journey passes 10 of 10 runs against a production
build; 418 analog/motor-sensitive tests pass; pin-move-chain is clean apart
from this sparse checkout's absent apps/. Hosted CI decides.
