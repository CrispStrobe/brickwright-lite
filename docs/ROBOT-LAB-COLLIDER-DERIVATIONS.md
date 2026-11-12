# Mesh-derived collider correction candidate

The declared shock-absorber and actuator proxy regions in
`data/part-collider-derivations.json` use their committed LDraw meshes, in local
LDU. `scripts/gen-part-colliders.mjs` updates only those declared part entries.
No source mesh, model placement, program, material or solver setting is changed.

The original vertex-selection method missed the positive-area tapered shoulder
of `2910.dat` between y = -27.5 and -25. The source edge midpoint
(-11.25, -26.25, 0) lies 1.25 LDU outside its former collider union. This is a
surface-coverage finding; it does not establish a particular simulated failure.
The shoulder now has its own declared region, preserving the narrower upper
body. Faces crossing a region boundary contribute their intersection points
even when no original vertex falls within the region.

Open regions exclude faces wholly coplanar with a boundary, so an adjacent
flange need not inflate a long body proxy. Crossing faces retain their limiting
edges. Independent test-side polygon subtraction checks the complete collider
union, including unchanged proxies and neighboring boundary ownership, over
every declared positive-area mesh section. It does not claim coverage outside
the declared regions, solid-volume equivalence or continuous collision safety.

Bounds use a rounded centre and outward-ceiled half-extents on a 0.0001 LDU
grid, followed by a check of both represented endpoints. The existing 0.01 LDU
overhang guard and construction tolerances remain unchanged. This numerical
grid does not imply corresponding physical accuracy.

The derivation records complete published collider lists and the original
replaced proxies. Generation admits only an exact original, published or newly
generated list; a mixed or otherwise edited list refuses before any part is
mutated. Repeated generation must be byte-stable and preserve unrelated parts.

Focused controls cover a hand-derived rational crossing slab with a distracting
interior island, coplanar flange ownership, recursive transformed geometry,
multiple clipping axes, missing inputs, rounding, repeat generation and the
actual shoulder witness. Separate test-side coverage code imports neither the
derivation nor generator. Removing crossings, restoring nearest rounding or
restoring old-only generation must fail controls.

This remains a source candidate until clean affected native, construction and
browser qualification and unchanged shipped-model verdicts are independently
admitted at its own tested head. The earlier published candidate's runtime
results cannot qualify this correction.
