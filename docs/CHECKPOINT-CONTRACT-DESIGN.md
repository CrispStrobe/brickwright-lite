# Upstreaming the checkpoint subsystem: what the contract has to say

Measured 2026-09-10 against lite `da05b003c` and bw-board `1f809683e` (the pin).
A design note, not a lane. It exists because the obvious plan — upstream the
diverged files largest first — would upstream a checkpoint *consumer* into a repo
with no checkpoint *concept*.

## The unit is a subsystem, and it is derived from imports

Twelve of the twenty-two divergences are one feature. That is not a judgement
about what the files are called; it is the import graph and a count of who
mentions the concept.

| evidence | result |
|---|---|
| `machine-checkpoint.js` imported by | `z80-machine.js`, `m6502-machine.js` |
| `instruction-debug-events.js` imported by | `z80-debug.js`, `m6502-debug.js` |
| checkpoint/replay mentions | `i8086-machine` 24, `i8086-debug` 14, `m6502-debug` 13, `emu8051-debug` 12, `z80-debug` 11 |
| the three tiny adapter diffs | exist only to set the replay-refusal flag |

So: the two lite-only core files, four machine/debug files that import them, three
more debug files that implement the same surface, and three adapters that feed it.
Taking `i8086-debug.js` first because it is 298 lines would take a consumer and
leave the thing it consumes behind.

## THE CONTRACT MUST EXPRESS TWO DIFFERENT REFUSALS, and it already does

This is the part that would get bolted on later if it were not stated now.

1. **This target cannot checkpoint at all.** Static, per target. emu8051's WASM ABI
   cannot serialise in-flight CPU, peripheral, timer, UART and external-input
   state. That is not a gap to be closed; it is a property of the ABI, and a
   contract that cannot say it will grow a special case.
2. **This target can checkpoint, but this SESSION cannot be replayed.** Dynamic,
   per topology. A live board changes input nets without going through the debug
   target, so a restored run diverges from the recorded one. `z80-machine.js:327`
   is the whole of it: `if (this._unloggedBoardInputs) reasons.push('live board
   buffer-input sampling is not logged')`.

A single boolean cannot carry both — one is a fact about the target, the other a
fact about the wiring. Lite's existing surface already gets this right, and the
upstream design should take it as found rather than reinvent it:

```js
checkpointSupport(chips, devices, reasons = [])  // -> {supported, reasons[]}
checkpointRefusal(support)                        // -> {refused, code, details}
```

Reasons are a LIST, contributed from two places: the component scan (a chip or
device with no paired state codec) and the caller's own reasons. emu8051 is then
not a special case at all — it contributes one reason and comes out unsupported,
by the same path a missing codec does.

**What the upstream work actually is**, therefore, is not designing a contract. It
is making this surface a declared part of the debug-target interface rather than a
convention three targets happen to share, and saying in the interface that a
refusal is a normal return value and not an exception.

## THREE AXES, and the third is the one that blocks

The first two are lego-ac's and they are orthogonal. The third came out of the
measurement and it decides whether a file can move at all.

1. **Ahead or superseded** — decides WHO acts: an upstream branch, or just a sync.
   Line counts cannot answer it; see `VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md`.
2. **Cluster or independent** — decides WHAT THE UNIT IS.
3. **Outward dependency** — decides whether it is upstreamable AT ALL. Three
   vendored files import from outside the vendored tree, and all three targets are
   absent upstream:

| vendored file | imports | upstream has it |
|---|---|---|
| `emu8051-debug.js` | `../bw-debug/opcodes.js` | no |
| `i8086-adapter.js` | `../bw-i8086-preferences.js` | no |
| `w65c02-cycle-provider.js` | `../bw-debug/conditional-cycle-provider.js` | no |

`emu8051-debug.js` is 277 lite-only lines and is in the cluster, so this is not a
footnote. Either the dependency moves upstream with it, or the code takes the
dependency by injection instead of by import. That choice should be made once, for
all three, before any of them moves.

## The twenty-two, classified

**Permanent — remove from the backlog, they cannot converge**

| file | why |
|---|---|
| `LICENSE` | attribution that must travel with the vendored copy |
| `cortex-m0-machine.js` (1/1) | `../../../node_modules` vs `../node_modules` — the vendoring mechanism itself |

**Move out of the vendored tree, do not upstream**

| file | why |
|---|---|
| `resolve-netlist.js` | lite-authored, and its only importers are lite's own `pico-sim-run.js` and `bw-debug/debug-runner.js`. Nothing in the vendored tree uses it. |

**The checkpoint cluster — one upstream unit**

`machine-checkpoint.js`, `instruction-debug-events.js`, `z80-machine.js`,
`m6502-machine.js`, `i8086-machine.js`, `z80-debug.js`, `m6502-debug.js`,
`i8086-debug.js`, `emu8051-debug.js`, and the refusal flags in `z80-adapter.js`,
`m6502-adapter.js`, `i8086-adapter.js`.

**Cycle providers — a second, smaller unit**

`z80-cycle-debug.js`, `floooh-z80-cycle-provider.js`, `w65c02-cycle-provider.js`,
`z80-target-factory.js`. Nothing in the vendored tree imports any of them; their
only importers are lite TESTS. So upstreaming them means upstreaming their tests
too, or they arrive with no consumer and no proof.

**Not yet classified** — `emu8051-adapter.js` (71 lite-only lines, zero checkpoint
mentions), `debug-target-factory.js` (12/32, zero mentions), `index.js` (2 export
lines). These are independent of the cluster and want reading, not counting.

## Sequence

1. Decide the outward-dependency policy once: move the three dependencies upstream,
   or invert them to injection.
2. Upstream the cluster as a unit, with the refusal surface declared in the
   debug-target interface.
3. Lite re-pins and its allow-list entries are deleted **in the commit that lands
   each file** — a ledger tidied afterwards is a ledger nobody trusts.
4. Then the cycle-provider unit, with its tests.
5. Read the three unclassified files.

Nothing here starts before the cluster's outward dependencies have a decision,
because that decision changes what the first commit looks like.
