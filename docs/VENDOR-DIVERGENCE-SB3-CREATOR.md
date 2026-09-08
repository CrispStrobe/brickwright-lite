# What lite changes in the vendored sb3-creator files, and why a byte comparison is the wrong question here

The other two vendored trees are compared BYTE FOR BYTE against upstream at the
pin, because they are copied unchanged. **This one is not copied unchanged.**
`scripts/sync-sb3creator.mjs` flattens `src/utils/<name>.js` into
`src/lib/sb3-creator-<name>.js` and REWRITES the relative imports to match:

```
-import micropythonToPseudocode from './micropythonToPseudocode.js';
+import micropythonToPseudocode from './sb3-creator-micropython.js';
```

Five of the fourteen mapped files differ from upstream on disk, and all five
differ **only** by that rewrite. A byte-identity gate over this tree would
assert something false and go red on the sync doing exactly what it is for. The
transform is the authority, and the sync's own `--check` already verifies it:
run against the tree at the pin, all fourteen files match after the rewrite.

## The hole this document closes

Before the `9173ca75` pin, the fourteenth was reported and then waved through:

```
  STALE sb3-creator-examples.js  (differs from sb3-creator@main)

  1 intentional downstream file delta(s) allowed.
```

`--allow-stale`, which is what `.github/workflows/vendor-freshness.yml` passes,
makes staleness non-fatal — `if (check && stale && !allowStale)`. So the
permitted set is **a count, not a list**: unbounded, unnamed, and unreasoned.
It was one file. A sync that half-finished tomorrow and left five would
print *"5 intentional downstream file delta(s) allowed"* and exit 0, with the
message itself calling the accident intentional.

**The word doing the work is "intentional", and nothing anywhere records whose
intention or what it was.** That is the same shape as an allow-list with no
reasons, which this repository refuses everywhere else.

So the set remains declared below. The gate asserts
the reported set EQUALS the declared set — not "is at most", because an entry
that stops being stale is a stale exemption, and an inventory that can only fail
one way becomes a graveyard.

## The declared deltas

There are none at `9173ca75`. The former `sb3-creator-examples.js` declaration
is retired in the same commit as the pin bump: upstream now owns the
`i8086_counter` example, and the normalized Lite/upstream catalogue delta is
exactly 0 lite-only / 0 upstream-only. Keeping the old declaration would be a
false exemption, so the exact-set gate must reject it.

```json
{
  "upstreamRepo": "sb3-creator",
  "syncScript": "scripts/sync-sb3creator.mjs",
  "why": "The permitted-delta set was a COUNT printed by the sync and allowed by --allow-stale, so it was unbounded, unnamed and unreasoned. This block names it. The gate runs the sync's own --check (which writes nothing -- verified) and asserts the STALE set equals this list exactly.",
  "measured": "2026-09-08, against sb3-creator 9173ca756a72e5be81578a084c4c783ebc5c267d: 14 mapped files, all 14 verified by the sync's transform, 0 declared deltas.",
  "deltas": {}
}
```

## What is NOT here, deliberately

The five import-rewrite differences are not listed. They are not divergence —
they are the transform, they are re-derived on every sync, and listing them
would be an inventory of the tool's own output that goes stale whenever the
naming scheme changes. The sync's `--check` is what proves those, and it does.
