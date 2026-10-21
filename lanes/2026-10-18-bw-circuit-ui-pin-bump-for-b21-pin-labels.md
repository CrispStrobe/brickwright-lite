## bw-circuit-ui pin bump for B21 pin labels — 2026-10-18

CLAIMED — Claude (circuit-editor lane). Bump the bw-circuit-ui pin from 055930e to
fe89e3425bf323b1acd9e3f98df6a7383e9b836b (bw-circuit-ui #91: pin names on the
generic module body no longer overlap; the part-face census gates it). CUI
dependencies are unchanged, so this is an exact SHA swap across the pin surfaces
(vendor-pins.json, both package.json/package-lock.json, both
bw-packages.sources.json, the i80386 circuits workflow and the
*-package-adoption tests). No other source changes.
