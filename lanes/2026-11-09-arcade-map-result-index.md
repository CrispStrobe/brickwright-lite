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

## Still open

The 69-case matrix imports cleanly but the VM refuses at run time: the
importer lowers `map` to a `repeat while` loop over locals, and the VM's
positional element proof covers only published global Arrays. A VM domain
proof for that lowered loop's in-bounds item reads is the next step.
