# Upstreaming the checkpoint subsystem: what the contract has to say

Measured 2026-09-10 against lite `da05b003c` and bw-board `1f809683e` (the pin).
A design note, not a lane. It exists because the obvious plan — upstream the
diverged files largest first — would upstream a checkpoint *consumer* into a repo
with no checkpoint *concept*.

> **THE PROPERTY EVERYTHING BELOW IS FOR: the vendored tree has no outward
> dependencies. That is what makes it vendorable.** It is why the third axis
> blocks at all, and it is the thing to check a ruling against. "Is this an engine
> fact or a downstream concern" is a heuristic for reaching it; where the heuristic
> and the property disagree, the property wins.

## WHAT HAS MOVED SINCE THIS WAS MEASURED (added 2026-09-10, later the same day)

**The measurements below stand as taken and the names in them do not.** This is a
dated correction rather than a rewrite: the reasoning is only checkable against
the tree it was performed on, and silently repainting it would destroy that.

- **The replay half of the cluster went upstream and came back.** bw-board now
  declares the surface in `src/debug-replay-contract.js` and all four targets
  implement BOTH halves; the vendored copies of `emu8051-adapter.js` and
  `i8086-debug.js` have converged on it (Lite `8dd901512`, `6f9b0cc5a`).
- **`onInput` IS GONE, and it never had a consumer.** Everywhere below that pairs
  `onInput` with `applyReplayInput`, read `onDebugInput`. The recorder
  (`bw-debug/recording-session.js:42`) has always gated on `onDebugInput` and
  returned null without it, so the 8051's `onInput` was reachable only from its
  own tests and **the downstream 8051 had never been recorded at all**. The
  observation this document makes — that counting one word found one half of a
  two-vocabulary surface — is exactly right, and the half it found was the name
  with no consumer.
- **`i8086-debug.js:581` and the other line numbers are stale.** The 8086 gained
  the record half it lacked, so the file moved.
- **`debug-runner.js`'s `targetKind === 'i8086'` special case is gone.** It existed
  because the 8086 could not record itself; with the target recording, the manual
  append became a duplicate, and the gate now keys on `canRecordDebugInput(target)`.
- **The 13-file checkpoint/replay cluster still stands as a cluster.** Only its
  replay half has moved; `machine-checkpoint.js`, `instruction-debug-events.js` and
  the per-machine capture/restore work remain `[lite]` or `[declared]`, and the
  third piece this document identifies — the DRIVER living downstream — is still
  downstream and still an undecided question.

## Two things to read first: the counts here, and the row that asked for this

**THE LINE COUNTS IN THIS NOTE ARE RAW `diff` COUNTS AND THE REPOSITORY'S ARE NOT.**
`sync-bw-board.mjs` and `LANES.md` row 380 report a set difference over TRIMMED
lines, which is order- and whitespace-insensitive. Mine came from
`diff | grep -c '^>'`. Worked example on `i8086-debug.js`, both measured here:

| measure | lite-only | upstream-only |
|---|---|---|
| trimmed set difference (the repo's, and row 380's) | 218 | 12 |
| raw `diff` (this note's, elsewhere) | 298 | 14 |

Neither is wrong; they answer different questions, and a reader comparing them
without knowing that will think one of them is. **Row 380 is the authority for the
inventory.** Where a number here disagrees with it, prefer row 380 and read this
note's figures as an ordering of magnitude only.

Row 380 also keeps two categories this note originally ran together: files that are
`[declared]` divergent — present on both sides and differing — and lite-authored
files, which are `[lite]`. They are different relationships to upstream and the sum
answers no question, so they are counted separately throughout and never added.
**The declared figure moves**: 18 at pin `b195fa0`, 14 at `fe523c1ae`, **12** at
`1f809683e` where this note is measured. Any count here is a count at a named pin
and a later bump moves it.

**AND THIS NOTE IS THE ANSWER TO A QUESTION ROW 380 ALREADY ASKED.** Re-derived
independently by brickwright-lite-0c on 2026-09-10, that row reaches the same place
by another route: the two purely lite-ahead adapter lines both set
`machine._unloggedBoardInputs`, `checkpointSupport` appears nowhere in bw-board's
`src/` at the pin or at the tip, and `machine-checkpoint.js` does not exist there
at all — "the unit of upstreaming here is the checkpoint subsystem, not five
adapter lines, and that needs a design conversation with bw-board rather than a
patch." This is that conversation. Two derivations, one answer, neither depending
on the other.

## The unit is a subsystem, and it is derived from imports

The checkpoint cluster is twelve files — ten of the twelve `[declared]` divergences
and two of the eight `[lite]` ones. That is not a judgement about what the files
are called; it is the import graph and a count of who mentions the concept. (The
two categories are counted separately throughout; see the classification below for
why summing them answers no question.)

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

**With a qualifier the rule needs, added after it failed once.** The rule as first
written assumed injection is always mechanically available. It is not:
**injection is an option only where a NON-VENDORED injection point exists on the
path.** For the cycle-provider boundary there is none — the only production caller
of `createW65C02ProviderBoundary` is `debug-target-factory.js:371`, itself
vendored — so injecting would relocate the dependency inside the vendored tree
rather than remove it. Where no such point exists the choice is move-it or
stay-blocked, and the heuristic has nothing to say.

| dependency | kind | ruling |
|---|---|---|
| `instructionLength` from `bw-debug/opcodes.js` | how many bytes an 8051 instruction occupies — an engine fact | **upstream it**, on its own merits, independent of checkpointing |
| `withI8086MemoryPreference` from `bw-i8086-preferences.js` | a user-selected memory preference | **invert to injection** — moving it up drags a settings layer into an engine library |
| `createConditionalCycleProviderBoundary` from `bw-debug/conditional-cycle-provider.js` | see below | **upstream it**; `cycle-provider.js` goes with it, and that part is the weaker half of the case |

The third was measured rather than assumed. `conditional-cycle-provider.js` is 79
lines importing only `cycle-provider.js`, which is 69 lines importing nothing — a
leaf pair. Both contain **zero** mentions of settings, storage, project, GUI or
preference. It is a provider-neutral, fail-closed selection boundary whose only
non-test consumer is `w65c02-cycle-provider.js`, itself an engine file. Generic
machinery for negotiating between engine components is an engine fact; the caller
that decides *which* provider to request may well be downstream, and the boundary
does not care.

**The number I first gave for `cycle-provider.js` was wrong and it cuts against the
move.** I said seven runtime importers, one of them lite's. That seven came from
counting files that merely CONTAIN the string `cycle-provider`, which matches
`conditional-cycle-provider` and `w65c02-cycle-provider` as well. Measured on the
exact specifier there are **three**, and all three are lite-side:
`bw-debug/debug-runner.js`, `bw-debug/cycle-replay.js`, and
`bw-debug/conditional-cycle-provider.js`. **No vendored file imports it directly**;
the vendored tree reaches it only transitively, through
`w65c02-cycle-provider.js` → `conditional-cycle-provider.js`.

So it is not "a lite file gets touched". `cycle-provider.js` is today entirely a
lite module with three lite consumers, and moving it up means lite importing it
back out of the vendored tree in two places, for something no vendored file uses
directly.

**The argument re-made against that shape.** The property being bought is that the
vendored tree has NO outward dependencies — that is what makes it vendorable, and
it is why this axis blocks at all. Moving both modules achieves it outright.
Injection does not: `negotiateCycleProvider` has exactly one call site inside the
boundary, but the only thing that could inject it is `w65c02-cycle-provider.js`,
which is itself vendored, so the dependency would simply move rather than leave.
Threading it from lite would mean a parameter added to two vendored functions and
carried through the factory's dynamic dispatch — more coupling, expressed as less.

The cost is real and stated: upstream acquires a 69-line module it does not
currently use, and two lite files import it back through the vendored tree. That
direction is already established — `bw-debug/debug-runner.js` imports
`../bw-board/resolve-netlist.js` today — so it is normal rather than novel.

`conditional-cycle-provider.js` is the stronger half and does not depend on this
argument: it has exactly one vendored consumer, `w65c02-cycle-provider.js`, which
is the file being unblocked.

**"Move only the boundary" is NOT a third option, and it looked like one.** I held
it in reserve as a fallback. `conditional-cycle-provider.js` line 1 is
`import {negotiateCycleProvider} from './cycle-provider.js'`, so moving it alone
would hand upstream an outward dependency on a LITE module — strictly worse than
today, where the outward dependency at least points from the vendored tree into
lite's own layer. They are a leaf pair and they move together or not at all. The
real options are both, or neither with `w65c02-cycle-provider.js` staying blocked.

**Ruling: move both.**

## The declared 12 and the lite-authored 8, classified

**Re-derived at pin `1f809683e` on 2026-09-10, after two retirements.** An earlier
version of this section was headed "the twenty-two", which summed `[declared]` and
`[lite]`. Those are different relationships to upstream — a file that exists on
both sides and differs, versus a file upstream does not have — and the sum answers
no question. The declared figure has also moved twice, 18 → 14 → **12**. Counted
separately below, and never added.

Two entries left the declared list since the first draft, and both were files this
note had already set aside: `cortex-m0-machine.js`, whose whole
divergence was a relative `node_modules` path, and `index.js`, two export lines.
Being classified as *not real divergences* and then retired is the outcome that
classification is for.

### `[declared]` — 12 files, exist on both sides and differ

| group | files |
|---|---|
| **checkpoint/replay cluster** (11) | `i8086-machine.js`, `m6502-machine.js`, `z80-machine.js`, `i8086-debug.js`, `m6502-debug.js`, `z80-debug.js`, `emu8051-debug.js`, `emu8051-adapter.js`, and the replay-refusal flags in `i8086-adapter.js`, `m6502-adapter.js`, `z80-adapter.js` |
| **cycle-provider unit** (1) | `debug-target-factory.js` — its lite-only lines ARE the two dynamic imports, the provider boundary and the selection |

**`emu8051-adapter.js` was the last unclassified file and it is in the cluster.**
It was left out because it mentions `checkpoint` zero times — and that count was the
wrong instrument, because this half of the subsystem uses different words. Its 58
lite-only lines are `observedInputs`, `recordInput`, `inputListeners`, `onInput(cb)`
and `applyReplayInput(input)`: the input-recording half of replay, deduplicated at
the native boundary, and described in its own comment as "recorder-compatible
host-input facts".

Measured rather than inferred — and the first version of this paragraph said
"three implementations" and was itself a count that was wrong, in a passage whose
argument is that counting was the wrong instrument. There are **four**, and all
four are `[declared]` divergent:

| implementer | |
|---|---|
| `emu8051-adapter.js:450` | the file this section is about |
| `i8086-debug.js:581` | already in the cluster |
| `m6502-debug.js:141` | already in the cluster |
| `z80-debug.js:113` | already in the cluster |

Four consumers, all lite-side, and the fourth is not like the others:
`bw-debug/instruction-replay.js:45`, `cycle-replay.js:47` and `timed-replay-io.js:74`
are generic drivers that REFUSE a target having neither `applyInput` nor
`applyReplayInput`; `debug-runner.js:2085` is a guarded target-specific caller
(`targetKind === 'i8086'`) that feeds a ROM image through the same surface. Three
drivers and one special case, not four of a kind.

So the adapter is the fourth implementation of a surface three of its siblings
already implement — not an outlier.

**The cluster is defined by a SURFACE, not by a word.** Two halves sharing no
vocabulary: `checkpointSupport` / `checkpointRefusal` for state, and
`onInput` / `applyReplayInput` for the input log. Counting one word found one half.
That is a by-name census missing a synonym — the same species as the import-syntax
miss recorded above, one level up.

### `[lite]` — 8 files upstream does not have

| group | files |
|---|---|
| **checkpoint cluster core** (2) | `machine-checkpoint.js`, `instruction-debug-events.js` |
| **cycle-provider unit** (4) | `z80-target-factory.js`, `z80-cycle-debug.js`, `floooh-z80-cycle-provider.js`, `w65c02-cycle-provider.js` |
| **move OUT of the vendored tree** (1) | `resolve-netlist.js` — zero importers inside the vendored tree, two in lite's own runtime (`pico-sim-run.js`, `bw-debug/debug-runner.js`) |
| **permanent** (1) | `LICENSE` — attribution that travels with the copy |

So the checkpoint/replay cluster is **13 files across both categories** (11
`[declared]` + 2 `[lite]`), and the cycle-provider unit is **5**. Those two numbers
are the ones to plan against; 20 is not a quantity anyone should act on. No
`[declared]` file is now unclassified.

**A consequence for the upstream design.** The replay DRIVER,
`bw-debug/instruction-replay.js`, is a lite file, and it is what refuses a target
lacking the surface. So the contract has a third piece beyond the two refusals: a
target-side surface (`onInput`, `applyReplayInput`) that upstream would declare,
and a driver that today lives downstream. Whether the driver follows it up is a
separate decision from whether the surface does, and it should be taken
deliberately rather than discovered when the first commit is written.

## Sequence

1. Apply the engine-fact/downstream-concern rule to each of the three dependencies
   — the rulings are in the table above; two move up, one inverts.
2. Upstream the cluster as a unit, with the refusal surface declared in the
   debug-target interface.
3. Lite re-pins and its allow-list entries are deleted **in the commit that lands
   each file** — a ledger tidied afterwards is a ledger nobody trusts.
4. Then the cycle-provider unit, with its tests.
5. Decide whether the replay driver (`bw-debug/instruction-replay.js`) follows the
   target-side surface upstream or stays downstream. A separate decision from
   whether the surface moves.

Nothing here starts before the cluster's outward dependencies have a decision,
because that decision changes what the first commit looks like.
