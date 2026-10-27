# Circuit UI capture-select re-render fix package adoption

CLAIMED and IMPLEMENTED in the same PR — x86 lane owner (claim+change, free-tier
rule). Base: current `main`. Branch `deps/cui-capture-select-pin-20261027`.

## Why

The Circuit UX browser gate failed with `ADC_POINT_MODE_PUBLICATION`: the scope
time-capture selector's `input` event saw `sample`, but by `change` the DOM
value was back to `envelope`, so the mode never switched. A host re-render
between the two events re-synced the controlled `<select value>` to stale state.

## Supplier

bw-circuit-ui [PR125](https://github.com/CrispStrobe/bw-circuit-ui/pull/125),
normally merged `a5860b9cf6cb0e7f652130ce987d51dc42651b8b` (parents `66e3724`,
`aa547374`; landed tree equals reviewed tree `2d86d5d3`). All three enabled
supplier checks passed on the exact head; its new browser regression failed on
the test-only commit before the fix. The supplier delta over the previous pin
`1bc233c9` also carries the already-qualified PR123/PR124 junction DC package
adoption (devDependency/provenance/tests only).

## Owned paths

Pin identity only, no behavior assertion changed: `vendor-pins.json`, both
`package.json`/`package-lock.json` pairs, both `bw-packages.sources.json`,
`scripts/lib/instrument-regression-cases.mjs` (`CONTRACT_SOURCES`),
`scripts/run-i80386-hdd-gui-actual.py` (`CUI`),
`.github/workflows/circuit-instrument-regression.yml`,
`.github/workflows/i80386-freedos-circuits-direct-actual.yml`, and the current
pin expectation in the ten existing package-adoption/source tests that assert it.

## Qualification

Every enabled exact-head check on this PR, including the Circuit UX light
browser gate, must pass before a matched-head merge. No gate, threshold or
assertion is relaxed.
