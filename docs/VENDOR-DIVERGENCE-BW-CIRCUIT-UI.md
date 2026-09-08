# Why `sync-bw-circuit-ui.mjs` refuses, and what `--overwrite-local` would cost

> **Resolved 2026-09-04.** The Lite-ahead potentiometer rendering and IBM PC
> set-1 keyboard path were reconciled upstream in `bw-circuit-ui@dc720e8`;
> newer upstream `CircuitDesigner`, machine extraction, footprint, reseat, and
> circuit-model work was then vendored back without discarding either side.
> This document remains as the incident record explaining why the guard must
> refuse before an upstream-first reconciliation.

**Measured 2026-09-04 against `bw-circuit-ui@2a02a8c`.**

`npm run sync:bwcircuitui` exits 3 with:

```
  local components/BoardCanvas.jsx
  local components/CircuitDesigner.jsx
  local components/VdpScreen.jsx

Upstream these patches to bw-circuit-ui first, then re-sync.
To knowingly DISCARD them instead: --overwrite-local
```

That is the tool working. This file exists because the refusal names the
files and not the stakes, and the flag it suggests is a one-word way to
lose work at two in the morning.

## What actually diverges

| file | lite-only lines | upstream-only lines | what lite adds |
|---|---|---|---|
| `components/VdpScreen.jsx` | 85 | 8 | Browser key → **IBM PC set-1 scancode** mapping. 8086 boards take these through the 8255's port A with IRQ1 — the path a bare-metal INT 09h handler and the BIOS both sit on, so it works with or without a BIOS. |
| `components/CircuitDesigner.jsx` | 19 | 46 | — see below, this one diverges **both ways** |
| `components/BoardCanvas.jsx` | 24 | 10 | Seated-knob sizing and positioning, with a separate seated-leg layer connecting the three electrical holes, including imported benches whose hole spacing is unusually wide. |

**`--overwrite-local` would delete the 8086 keyboard path.** That is the
concrete cost, and it is not recoverable from upstream because upstream has
never had it.

## `CircuitDesigner.jsx` is the one that is not simply "ahead"

It has **19 lines lite has and upstream lacks, and 46 lines upstream has and
lite lacks.** So this is not a patch waiting to be upstreamed — it is a
two-way divergence, and lite is *behind* on more lines than it is ahead.
Whoever reconciles it has to read both directions; taking either side
wholesale loses something.

That asymmetry is the reason this file is a note rather than a TODO. "Upstream
these patches" is the right instruction for `VdpScreen` and `BoardCanvas` and
the **wrong** description of `CircuitDesigner`.

## What to do

1. **Do not run `--overwrite-local`** to get past the refusal. It is the flag
   that turns a loud stop into a silent loss.
2. Upstream `VdpScreen`'s scancode mapping and `BoardCanvas`'s seated-knob
   layer to `bw-circuit-ui`, then re-sync — those two really are lite-ahead.
3. Reconcile `CircuitDesigner` by reading both sides. Its 46 upstream-only
   lines are work lite has been missing, so this is worth doing on its own
   merits and not only to unblock the sync.

## What was NOT blocked by this

The 8086 DIP drawings and palette registry landed anyway (`d93a13479`):
`parts-data/index.js` and the SVGs were taken directly after proving the copy
loses nothing — upstream lists 267 parts, lite 260, and **nothing in lite is
absent upstream**. Data files were safe to take; the three components were not,
which is exactly the distinction the refusal is protecting.

## The machine-readable part

Everything above is prose and prose goes stale -- see `why` below for how
badly, measured. The block is what `test/vendor-identity.test.mjs` reads.

```json
{
  "upstreamRepo": "bw-circuit-ui",
  "vendoredRoots": [
    "overlay/scratch-gui/src/lib/bw-circuit-ui",
    "packages/scratch-gui/src/lib/bw-circuit-ui"
  ],
  "why": "THE PROSE BELOW WAS WRONG IN EVERY ROW BY THE TIME ANYONE READ IT, which is the same failure docs/VENDOR-DIVERGENCE-I8086-MACHINE.md records about its own earlier prose version: a document that DESCRIBES a divergence has no way to notice when one changes. Measured 2026-09-07 against upstream at the pin: VdpScreen.jsx and BoardCanvas.jsx, both listed below as diverging, are now BYTE-IDENTICAL -- they were upstreamed and the table was never updated. CircuitDesigner.jsx is described as diverging BOTH WAYS with lite behind on 46 lines; it is 11 lite-only lines and ZERO upstream-only, so lite is purely ahead and the paragraph warning that 'taking either side wholesale loses something' no longer describes it. And ExamplesBrowser.jsx, the largest divergence in the tree, is not mentioned at all. This block is what the gate reads, so from now on the document and the tree cannot disagree without something going red.",
  "measured": "2026-09-08, overlay root, against bw-circuit-ui@e18dad586: all upstream src files are byte-identical, 0 divergent, 2 lite-authored (below). ExamplesBrowser.jsx and intro-doc.jsx converged upstream in PR 18; the latter is now an ordinary vendored file.",
  "files": {},
  "lineLevelOnly": {
    "why": "No line-level divergence remains. CircuitDesigner.jsx left after its test handles were upstreamed in PR 12. ExamplesBrowser.jsx left after PR 18 upstreamed the shared intro-document extraction and the owner-requested confirm-dialog device-selection behaviour. The sync now copies both it and intro-doc.jsx from upstream without a keep rule.",
    "files": []
  },
  "liteAuthored": {
    "why": "Files lite has that upstream does not, inside a vendored root -- the same inventory docs/VENDOR-DIVERGENCE-I8086-MACHINE.md keeps for bw-board, and for the same reason: upstream has no copy to restore them from and no upstream review ever sees them. Each reason must say why the file lives in a vendored directory rather than beside lite's own code.",
    "ratchet": "Removal is free. An addition costs a reason in the same commit, and the gate refuses any lite-authored file not listed, so adding the file without the reason cannot go green.",
    "files": {
      "LICENSE": {
        "reason": "Upstream's licence text, carried with the vendored copy so the terms travel with the code rather than living only in a manifest. Upstream keeps it at the repository root, not under src/, so it has no counterpart at the path this comparison walks. Attribution, not code.",
        "importedBy": []
      },
      ".vendor-manifest.json": {
        "reason": "Written by sync-bw-circuit-ui.mjs to record what it copied. It is generated INTO the vendored root by the sync itself, so it is lite-authored by construction and can never have an upstream counterpart.",
        "importedBy": []
      }
    }
  }
}
```
---

# A SECOND DIVERGENCE, 2026-09-08

Measured against `bw-circuit-ui@23b9d93` (master, after PR 11), from lite at
`2c75b8fcc`. The September divergence above is resolved and this is a new one, so
the two must not be read as the same incident.

`node scripts/sync-bw-circuit-ui.mjs --dir <clone> --pin` refuses, naming five
files:

```
  local components/BoardCanvas.jsx
  local components/CircuitDesigner.jsx
  local components/ExamplesBrowser.jsx
  local hooks/useBoard.js
  local interaction/transform.js
```

## THE LIST IS NOT A LIST OF PROBLEMS. Three of the five need nothing.

Diffed file by file against `23b9d93` rather than trusted:

| file | lite-only | upstream-only | verdict |
|---|---|---|---|
| `components/BoardCanvas.jsx` | 0 | 0 | **identical to upstream today** |
| `hooks/useBoard.js` | 0 | 0 | **identical to upstream today** |
| `interaction/transform.js` | 0 | 0 | **identical to upstream today** |
| `components/CircuitDesigner.jsx` | 13 | 23 | two-way, and both directions legible |
| `components/ExamplesBrowser.jsx` | 37 | 150 | two-way, large, unread |

**The script compares against the LAST SYNC BASELINE, not against current
upstream.** So a file that diverged and has since converged still appears on the
refusal list. Three of the five had already converged. Anyone acting on that list
without re-measuring would reconcile three files that need nothing, and would
conclude the divergence is nearly twice its real size.

That is worth stating plainly because five gates lean on this script: a refusal
list is evidence that something *was* different at some point, not that it *is*
different now. **Re-measure before reconciling.** It is the same species of fault
as an instrument answering a question nobody asked — the comparison is sound, and
its operands are not the ones the reader assumes.

## `CircuitDesigner.jsx` — reduced to one direction, 2026-09-08

Both directions were legible, unlike September's:

- **23 upstream-only lines**: the demo-pin-script fix (`bw-circuit-ui@dce2975`,
  merged as `23b9d93`). The designer's placeholder animation now stands down when
  a project declares pins, instead of blinking every output pin from one shared
  value on top of a running program.
- **13 lite-only lines**: two `data-testid` attributes on the machine-media
  controls and their comment, for the i8086 boot-media gate.

They do not conflict. The lite-only half was upstreamed
(`fix/machine-media-test-hooks`, `02596e5`), which leaves this file **behind
only** — a state a plain sync resolves. Measured after that change: the remaining
"lite-only" lines are the two lines the demo-blink fix itself supersedes, not a
divergence.

## `components/ExamplesBrowser.jsx` — SCHEDULED, not tonight

37 lite-only lines and **150 upstream-only**. Neither side has been read. This is
the one that still blocks the sync, and it is the reason lite cannot re-pin
`bw-circuit-ui` today, which in turn blocks the dual-blink browser gate from
going green.

A blocked lane with a named blocker is a healthier state than a landed lane with
an improvised reconciliation underneath it. Whoever takes it should read both
directions, as the September note says, and should expect the 150 to contain work
lite has been missing rather than noise.

## Still not `--overwrite-local`

Unchanged from September and for the same reason. The flag turns a loud stop into
a silent loss, and the previous time this shape appeared it would have deleted an
8086 keyboard path upstream has never had.

---

# A LINE COUNT CANNOT TELL "AHEAD" FROM "SUPERSEDED"

Measured twice on 2026-09-08, in two different repositories, hours apart. Both
times a file read as a two-way divergence and was one-way once the lines were
READ instead of counted. This note exists because the counts in the tables above
are the first thing anyone looks at, and on their own they cannot make the
judgement the reader will make from them.

| file | counted | actually |
|---|---|---|
| `bw-circuit-ui` `components/CircuitDesigner.jsx` | 13 ahead, 23 behind | after the lite-ahead half was upstreamed, the 2 remaining "ahead" lines were `if (mcu) {` and the effect's dependency array — the exact lines the incoming fix replaces |
| `bw-board` `src/board.js` | 11 ahead, 73 behind | the 11 are the inner loop of the old buzzer-edge recorder, which upstream now expresses as an extracted `_buzzerOnPin`. Upstream has `_buzzerOnPin` 4 times and `setTone` 3; lite has neither, 0 times |

In both cases the "lite-only" lines are the OLD form of code the upstream change
rewrote. A diff cannot see that, because a rewritten function is textually a
deletion and an addition, and the deletion counts as lite-ahead.

**Why it matters more than a wrong number.** "Ahead" means someone must reconcile
by hand before a sync can run. "Superseded" means a plain sync is correct and
loses nothing. Those are a scheduled task and a no-op, and the count reads
identically for both. A file that looks blocked can turn out to be unblocked by
nobody doing anything except looking at it.

**How to read these tables.** Treat the lite-only count as an upper bound on the
work, never as the work. Before scheduling a reconciliation, read the lite-only
lines and ask whether the upstream change rewrote that same region. If it did,
the file is behind-only and belongs in a pin leg rather than on someone's desk.

Same family as the refusal-list note above: a number standing in for a judgement
it cannot make. There the count was of files that had already converged; here it
is of lines that were never ahead.
