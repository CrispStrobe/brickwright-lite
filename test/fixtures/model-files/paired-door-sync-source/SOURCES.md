# Paired Door Sync — source record

- **Origin:** the experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), built by an automated model-builder agent, construction repaired in #1551 (two carriage pins seated along their own axes).
- **Adaptation at promotion (2026-11-07):** the SPIKE hub's `!BW ID chassis_reference` renamed to `hub` (identifier only; no geometry, part or program change) so the standard hub observation base applies.
- **Law (`opposed-rack-pinion-v1`):** one 16-tooth 94925 pinion (module 1 mm, pitch radius 8 mm) between two racks on opposite sides; each passive rack moves ±8 mm per radian of the observed pinion angle, with signs from the geometry, and the two positions sum to zero.
- **Disconnection** (`pinion` removed): motor A still turns its axle, but the racks lose the ±8 mm/rad law (measured 24 mm, loss needs > 2 mm).
