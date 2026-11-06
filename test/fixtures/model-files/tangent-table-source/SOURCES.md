# Tangent Table — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively before promotion.
- **Adaptations (made at intake, unchanged here):** the licence line points at the packaged licence. Geometry and program are unchanged.
- **Law (`tangent-table-v1`):** motor A sets a guide angle θ, motor B a cross-slide reach d; the passive output pin on both has transverse offset y = d·tan θ.
- **Disconnection** (`radial_sleeve` removed): the follower’s only sliding bearing on the radial guide; the output pin no longer rides the line at θ (measured 13.4 mm, loss needs > 2 mm). Removing follower_axle instead leaves the sleeve nested in the output bearings, whose contact keeps the law within 0.25 mm.
