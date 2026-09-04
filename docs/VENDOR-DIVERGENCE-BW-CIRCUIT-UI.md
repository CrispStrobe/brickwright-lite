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
