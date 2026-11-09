# Arcade row 2f (import side): inline map index and per-Array callback facts

Status: DONE in the implementing PR (claim and change together) for the import
side. The `makecode-array-map-values` row stays TODO for a VM-side proof.
Owner: Arcade lane, row 2f of `lanes/2026-11-03-arcade-pending-after-1643.md`.
Base: main `4b2f5047dde6a8609b5881c93b510028eb83fb07`.

## Change (`overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js`)

- Procedure-constraint validator (no Array value graph): a fully inline
  `[literal].map(callback)[k]` (no spread; callback with at most value and
  index; constant `k` below the literal length) reads the callback's result.
  A stored map result, a named receiver, a third callback parameter, a
  non-constant or out-of-range index keep the opaque read.
- Callback entry census: a builtin Array mutation (`push`, `pop`, `shift`,
  `unshift`, `insertAt`, `removeAt`, `splice`, `reverse`, `sort`, `fill`) or
  an index write through a receiver whose allocations are all known withholds
  entry facts only from callbacks whose receiver lineage includes one of those
  allocations. Unknown calls and every other effect still withhold all facts.
- Operator decision (2026-11-09): the control variant "a callback pushes to a
  fresh Array it allocates" now keeps the receiver's facts (new positive test);
  the control keeps an alias-of-receiver push inside the callback as refusal.

## Tests

`test/makecode-inline-map-index-producer.test.mjs` (positive + six near
misses) and new cases in `test/arcade-primitive-array-callback-source.test.mjs`.
Mutations: removing the inline bridge, the taint, or the tainted-lineage check
each fails a test.

## VM side (`overlay/scratch-vm/src/extensions/crispstrobe/arcade/console-inspect-values.js`)

A Number-constrained argument read from a push-only local Array family (one
empty allocation; locals only aliased, pushed to, measured or item-read; no
escape or capture) has the pushed values' domains when the read is in bounds:
a constant below the straight-line pushes before it; the importer's canonical
`repeat while I < LEN` map loop (LEN the family length set once before, I set
to 0 before and advanced by exactly +1 as the body's last statement); or a
constant index of that loop's single-push result below the receiver's
straight-line pushes. New `test/arcade-lowered-map-loop-domain.test.mjs`:
positive plus three refused edits (step of two, pop on the receiver, index past
the pushes). Mutations: original VM, no step check, no constant bound, pops
allowed each fail a test.

## Still open

Import, run, Code, both SB3 routes and export of the 69-case matrix pass. The
reimport of the exported lowered loop (`while` over hoisted locals with
`push` and `[0]`) refuses because `dense-array-loop-entry.js` is closed over
the whole program, and the matrix has callbacks, templates and loops
elsewhere. A per-site version of that loop entry proof is the next step.
