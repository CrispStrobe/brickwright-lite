# What lite changes in the vendored sb3-creator files, and why a byte comparison is the wrong question here

The other two vendored trees are compared BYTE FOR BYTE against upstream at the
pin, because they are copied unchanged. **This one is not copied unchanged.**
`scripts/sync-sb3creator.mjs` flattens `src/utils/<name>.js` into
`src/lib/sb3-creator-<name>.js` and REWRITES the relative imports to match:

```
-import micropythonToPseudocode from './micropythonToPseudocode.js';
+import micropythonToPseudocode from './sb3-creator-micropython.js';
```

Six of the fourteen mapped files differ from upstream on disk, and five of those
six differ **only** by that rewrite. A byte-identity gate over this tree would
assert something false and go red on the sync doing exactly what it is for. The
transform is the authority, and the sync's own `--check` already verifies it:
run against the tree at the pin, thirteen of fourteen files match after the
rewrite.

## The hole this document closes

The fourteenth is reported and then waved through:

```
  STALE sb3-creator-examples.js  (differs from sb3-creator@main)

  1 intentional downstream file delta(s) allowed.
```

`--allow-stale`, which is what `.github/workflows/vendor-freshness.yml` passes,
makes staleness non-fatal — `if (check && stale && !allowStale)`. So the
permitted set is **a count, not a list**: unbounded, unnamed, and unreasoned.
Today it is one file. A sync that half-finished tomorrow and left five would
print *"5 intentional downstream file delta(s) allowed"* and exit 0, with the
message itself calling the accident intentional.

**The word doing the work is "intentional", and nothing anywhere records whose
intention or what it was.** That is the same shape as an allow-list with no
reasons, which this repository refuses everywhere else.

So the set is declared below, by name, with what each one is. The gate asserts
the reported set EQUALS the declared set — not "is at most", because an entry
that stops being stale is a stale exemption, and an inventory that can only fail
one way becomes a graveyard.

## The declared deltas

`sb3-creator-examples.js` carries **one lite-authored example that upstream does
not have**: `i8086_counter`, a multiplexed eight-digit seven-segment counter for
the 8086 boards, about 25 lines of program text and prose. It is lite content in
a vendored file rather than a vendoring artefact, which is precisely why it
needs saying out loud: the next unscoped sync overwrites it, and nothing else in
the tree would notice.

```json
{
  "upstreamRepo": "sb3-creator",
  "syncScript": "scripts/sync-sb3creator.mjs",
  "why": "The permitted-delta set was a COUNT printed by the sync and allowed by --allow-stale, so it was unbounded, unnamed and unreasoned. This block names it. The gate runs the sync's own --check (which writes nothing -- verified) and asserts the STALE set equals this list exactly.",
  "measured": "2026-09-08, against sb3-creator at the pin: 14 mapped files, 13 verified by the sync's transform, 1 declared below.",
  "deltas": {
    "sb3-creator-examples.js": {
      "what": "The i8086_counter example: a multiplexed eight-digit seven-segment counter driven from one port, with the prose explaining why scanning at ~1 kHz refreshes each digit 125 times a second.",
      "falsifiable": "Take upstream's copy and the 8086 counter example disappears from the catalogue -- the board keeps working, so nothing fails, and the example is simply gone.",
      "direction": "lite-ahead: 19 lite-only lines, 0 upstream-only. Upstream has never had it."
    }
  }
}
```

## What is NOT here, deliberately

The five import-rewrite differences are not listed. They are not divergence —
they are the transform, they are re-derived on every sync, and listing them
would be an inventory of the tool's own output that goes stale whenever the
naming scheme changes. The sync's `--check` is what proves those, and it does.
