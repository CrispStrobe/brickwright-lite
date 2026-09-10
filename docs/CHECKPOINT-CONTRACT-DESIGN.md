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
footnote.

### The policy is one RULE applied three times, not one answer

A blanket "move them all up" or "invert them all" gets at least one wrong, because
the three differ in kind. The question to ask of each is: **is this dependency an
ENGINE fact or a DOWNSTREAM concern?**

| dependency | kind | ruling |
|---|---|---|
| `instructionLength` from `bw-debug/opcodes.js` | how many bytes an 8051 instruction occupies — an engine fact | **upstream it**, on its own merits, independent of checkpointing |
| `withI8086MemoryPreference` from `bw-i8086-preferences.js` | a user-selected memory preference | **invert to injection** — moving it up drags a settings layer into an engine library |
| `createConditionalCycleProviderBoundary` from `bw-debug/conditional-cycle-provider.js` | see below | **upstream it**, with `cycle-provider.js` |

The third was measured rather than assumed. `conditional-cycle-provider.js` is 79
lines importing only `cycle-provider.js`, which is 69 lines importing nothing — a
leaf pair. Both contain **zero** mentions of settings, storage, project, GUI or
preference. It is a provider-neutral, fail-closed selection boundary whose only
non-test consumer is `w65c02-cycle-provider.js`, itself an engine file. Generic
machinery for negotiating between engine components is an engine fact; the caller
that decides *which* provider to request may well be downstream, and the boundary
does not care.

One consequence to state rather than discover: `cycle-provider.js` has seven
runtime importers today, and one of them is lite's own `bw-debug/debug-runner.js`.
After the move that becomes lite importing from the vendored tree, which is the
normal direction, but it means the move touches a lite file too.

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

**Cycle providers — a second unit, rooted in the vendored tree**

`debug-target-factory.js`, `z80-target-factory.js`, `z80-cycle-debug.js`,
`floooh-z80-cycle-provider.js`, `w65c02-cycle-provider.js`.

> **A FIRST VERSION OF THIS SECTION SAID NOTHING IN THE VENDORED TREE IMPORTS ANY
> OF THEM, AND THAT WAS FALSE.** It was derived with a grep for
> `from './<file>'`, and `debug-target-factory.js` reaches two of them by
> `await import('./z80-target-factory.js')` and
> `await import('./w65c02-cycle-provider.js')`. A dynamic import is invisible to a
> static-import scan, which is the same trap as a constructed path defeating a
> by-name census. The consequence drawn from it — that upstreaming these means
> upstreaming their tests or they land with no consumer — is WITHDRAWN. They have
> a consumer, it is a vendored file, and it is on the runtime path.

That also classifies `debug-target-factory.js`, which the first version left
unclassified: its 12 lite-only lines ARE this wiring — the two dynamic imports,
the provider boundary, the selection, and the returned `providerBoundary` /
`providerSelection`. It is the root of this unit, not an independent divergence.

**Not yet classified** — `emu8051-adapter.js` (71 lite-only lines, zero checkpoint
mentions) and `index.js` (2 export lines). These want reading, not counting.

## Sequence

1. Apply the engine-fact/downstream-concern rule to each of the three dependencies
   — the rulings are in the table above; two move up, one inverts.
2. Upstream the cluster as a unit, with the refusal surface declared in the
   debug-target interface.
3. Lite re-pins and its allow-list entries are deleted **in the commit that lands
   each file** — a ledger tidied afterwards is a ledger nobody trusts.
4. Then the cycle-provider unit, with its tests.
5. Read the three unclassified files.

Nothing here starts before the cluster's outward dependencies have a decision,
because that decision changes what the first commit looks like.
