# Bend Ripple — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively before promotion.
- **Adaptations (made at intake, unchanged here):** the licence line points at the packaged licence. Geometry and program are unchanged.
- **Law (`cardan-bend-v1`):** one Cardan joint at bend β; the passive output follows ψ = atan2(sin θ, cos β·cos θ) relative to its carrier while motor B changes β.
- **Disconnection** (`output_fork` removed): nothing imposes the Cardan law on the output shaft.
