# Adopting the shared event module in `i8086-debug.js`

**Status:** preparation, not a lane. Written 2026-09-11 while the measurements were
fresh, for whoever runs the lite-side adoption after the bw-board pin bump.

`i8086-debug.js` is the only debug target in either repo that hand-rolls its own
debug-event publication. `m6502-debug.js` and `z80-debug.js` here already call
`installInstructionDebugEvents`; so does `avr8js-adapter.js`. Upstream's copy of
this file adopted it at bw-board `6948aff`, so after the pin bump lite will be
carrying a local reimplementation of a module it vendors.

Every count below was measured, not estimated. Re-derive them at the pin you
actually bump to — this was taken against lite `44c83c67d` and bw-board master
after `002fe55`.

---

## 0. READ THIS FIRST — the trap that fails with nothing red

**Upstream wraps `adapter.sendSerial`. Lite does not.**

```
adapter.sendSerial = <wrapper>     upstream 1 occurrence      lite 0
rawSendSerial / rootDebugSendSerial upstream 2 occurrences    lite 0
```

The two `sendSerial` bodies differ, and the difference is a *consequence* of that
asymmetry rather than an independent divergence:

```js
// upstream — wraps, so the WRAPPER records; publishing here too would double-log
if (typeof adapter?.sendSerial === 'function') return adapter.sendSerial(b) === true;
accepted = machine.serialIn(b); if (accepted) publishInputEvent(...)

// lite — does NOT wrap, so publishing here is the ONLY record
send = adapter?.sendSerial ?? machine?.serialIn ?? null;
accepted = send(b); if (accepted) publishInputEvent(...)
```

**Taking upstream's `sendSerial` without also taking the wrapping loses lite's
serial record on the adapter path entirely.** Silently. No test fails, because
nothing in lite currently expects a wrapper to exist.

Both sides are correct for themselves. Take both halves or neither.

*(Historical note that completes the chain: upstream's wrapping was installed on a
throwaway object literal until bw-board `03a3eff` — the factory passed
`{machine: adapter.machine}`, so the wrapper never reached the real adapter.
Upstream's early-return-without-publish only became correct when that landed.)*

---

## 1. What is deleted, and what replaces each

Upstream count of **0** is the test that a symbol is genuinely lite-only
machinery rather than something both sides keep.

| lite symbol | refs | def | replaced by |
|---|---|---|---|
| `publishDebugEvent` | 5 | 313 | the module publishes; subscribe via its handle |
| `debugEventListener` | 12 | 218 | `debugEvents.onDebugEvent(listener)` |
| `instructionObserver` | 3 | 394 | the module's `cpu.step` bracket |
| `originalInstructionHook` | 3 | 222 | nothing — the bracket needs no save/restore chain |
| `lastRetiredPcBefore` | 4 | 219 | nothing — see §3, it has already gone upstream |
| `originalPortHook` | 3 | 220 | the module's `inPort`/`outPort` wrappers (`port: true`) |
| `originalInterruptHook` | 3 | 221 | **nothing yet — see §4** |
| `eventDomain` | 4 | 252 | keep; upstream has it too (4 refs) |

**A deletion brief that lists only what to delete is a brief that has done the
easy half.** The table above is the easy half. This is the other one.

**Do not delete these.** They exist on both sides and upstream still uses them:
`eventTime` (6), `eventTimeEpoch` (5), `lastEventTicks` (5), `observedInputs` (5),
`syncEventHooks` (5), `cachedVideoKey` (3), `cachedVideoFrame` (4).

The last two are **newer than the divergence** — they arrived upstream in trip 4
(`ce86d89`) as the video cache, so they are lite-ahead work that has already been
sent up, not machinery to remove.

## 2. What is added

One `installInstructionDebugEvents` call, and one delegating `onDebugEvent`.
Copy the wiring from upstream's `i8086-debug.js`, not from `m6502-debug.js` — the
8086 passes four arguments the 6502 does not:

```js
addressMask: 0xfffff,          // 20-bit bus; the default 0xffff truncates every
                               // fetch above 64K and looks right for the first 64K
pcOf: c => c.pc & 0xfffff,
port: true,                    // the 8086 has a separate I/O space
clock: () => machine.cycles,
timeDomain: 'i8086-cycles',    // must match, or facts and debugTime() disagree
captureRegisters / captureInstruction   // via machine._architecturalRegisters()
                                        // and disasmI8086
```

## 3. Things that look like work and are not

- **`lastRetiredPcBefore`** existed to set `pendingStep.entered` only when the call
  itself retired. That refinement was ported upstream, mutated, found to red
  nothing once the step-over halt requires `cpu.pc === returnAddr`, and dropped
  (bw-board `173e38f`). Do not port it here either; delete the symbol.
- **`syncWriteTrap`'s fact publication** (the `publishDebugEvent` call inside it)
  goes with the deletion. The trap itself stays — it is the write *watchpoint*.
- **`step`'s six bare `syncEventHooks()` calls** exist because lite hand-rolls the
  hooks. They go with the deletion; `syncEventHooks` itself stays.

## 4. Known gaps to carry, not to fix here

- **`kind: 'interrupt'` disappears.** Measured: the module mentions `interrupt`
  **0** times, and no upstream target has ever published one. Lite's pre-bump
  i8086 was the only publisher anywhere. This is a missing *vocabulary*, not a
  missing call — a declared module extension (`publishInterrupt`, following
  `publishIdleElapse`/`publishClockJump`) is the shape. **A replay from a log
  missing every interrupt diverges at the first one and nowhere before it**, so
  this is worth tracking rather than absorbing.
- **`capabilities().events` must list what is actually published.** Upstream's is
  `['instruction', 'memory', 'port']` — deliberately *without* `interrupt`,
  because declaring a kind nothing publishes restores the claim without the fact.
  See bw-board `002fe55`.
- **Instruction fetches now appear in the memory stream.** Ruled 2026-09-11: they
  stay *out*, suppression to be declared at the wrap site in the module. Until
  that lands, expect fetch reads in the stream and do not widen any lite contract
  to accommodate them.

## 5. How to know it worked

The convergence decoupled claims from the things they are about, in **both**
directions, so neither kind of test catches both halves:

- a **contract** test reading `capabilities()` catches a lost declaration;
- a **behavioural** test driving the target catches a lost fact.

Assert every declared event kind is observed coming out, and every observed kind
is declared. That pair is what makes the list non-vacuous — comparing a
declaration to a hard-coded array passes just as well when both are wrong, which
is exactly how the missing declaration survived the upstream convergence.
