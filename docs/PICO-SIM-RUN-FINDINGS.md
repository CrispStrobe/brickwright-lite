# Pico MicroPython simulator Run — findings

Findings surfaced while wiring N3c (the Python tab's ▶ Run for the Pico boots
MicroPython in rp2040js and runs the program over the same `createPicoRepl`
transport the silicon path uses). Numbered so they can be handed off and closed
individually.

---

## N3c-1 — `machine.reset()` does not reboot rp2040js (bw-board adapter gap)

**Resolved 2026-09-06.** bw-board `435599c` exposes a reset request at the
watchdog instruction boundary; Lite consumes it by replacing the complete SoC
and USB CDC epoch while preserving flash and the external board.

**Claim.** In bw-board's rp2040js adapter, a MicroPython `machine.reset()` does
not reboot the emulated core. Execution stalls instead of re-running boot stage
2 and the stored program: the watchdog / SIO reset path that a real RP2040 uses
to restart appears to be unmodelled, so the reset is a dead end rather than a
restart.

**Measured** (this box, 2026-09-06, on a worktree at lite origin/main
`4f449e832`, which pins bw-board `88bbdcf78`; minimal integrated root built from
that tree's overlay). Driver: `scripts/probe-pico-micropython.mjs` +
`createPicoRepl` from `src/lib/pico-repl.js`, with a mock board attached to the
adapter to record pin edges.

- `createPicoRepl(transport).deployMainPy('… Pin(25, Pin.OUT).on() …')` writes
  main.py (56 bytes) and issues `machine.reset()`. After it returns, driving the
  emulator forward another 8 × 1.5M instruction budgets advances the step
  counter **not at all** — it is pinned at **2,191,927** steps across every
  slice. `main.py` never executes; GP25 is never driven; the onboard LED stays
  dark.
- By contrast `createPicoRepl(transport).exec('… led.on()')` on the same booted
  machine drives GP25 `pushpull` HIGH immediately, and `led.off()` drives it
  LOW — the full toggle is observed on the mock board through the adapter's
  `publishPin → board.setPin` chain. So the boot, the REPL, the transport and
  the GPIO→board wiring are all sound; only the reset-reboot is missing.

**Historical learner impact.** A learner's own program that called
`machine.reset()` froze the simulator in exactly this way — no output, no
error, no LED. Before the repair, Lite's Pico ▶ Run:

1. used **run-live** (`exec`) rather than **install-and-reboot** (`deployMainPy`)
   for the simulator — the one seam that differs between sim and silicon, named
   for the thing that actually differs (persistence), not for sim-vs-silicon;
   the Pico's silicon path keeps install-and-reboot, which a real Pico honours.
2. **refused by name** when the program text called `machine.reset()`, with the
   sentence "the simulator does not model machine.reset() yet (bw-board finding
   N3c-1); it would freeze here — run it on real hardware", rather than silently
   swallowing the reset and hanging.

**Close-out evidence.** The simulator now uses `deployMainPy`, observes the
watchdog request, terminates the old epoch, boots a fresh adapter from the exact
post-deploy flash, reconnects USB, and permits `machine.reset()` in learner
programs. Unit tests prove flash/board preservation, stale-byte disposal,
pending and future transport-read rejection after terminal faults, and prompt
failure propagation. The hosted browser gate runs GP25-high, stops, switches
back to Pseudocode, runs a different GP24-high program, and observes the second
reset generation and USB enumeration without reloading the page. Missing
firmware continues to refuse by name.
