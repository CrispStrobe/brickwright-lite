# Toggle Lever — source record

- **Origin:** the OpenCode builder agent run 2 (`bw-opencode-*-r2`, model-lab), model `toggle_jaw_crusher`. Its geometry diverged from the closure law because of saved-pose clashes.
- **Repaired 2026-10-25 by the reviewer.** The jaw lever is pivoted at its end, the link moved to its own layer, the pivot axle shortened, the guide caps removed, the bracket pin changed to 2780 and the anvil removed (112 parts).
- **Construction fixes for promotion (2026-10-26):**
  - The jaw pivot rail moved forward 20 LDU, so it stacks on the rear posts instead of crossing them; the bracket pin became a 3L pin to reach it.
  - Both link axles are clocked to the link's axle holes.
  - Mechanism, bodies and joints are unchanged.
- **Program:** 30 °/s, crank 0 → 85 → 0, stopping short of dead centre.
- **Law:** the lever follows the closed-loop toggle geometry within 0.03° up to a crank angle of 60° and within 1.8° at 60–85°. Disconnection (crank pin removed): the crank still turns 85°, but the free yoke, link and lever no longer follow the law (error about 75°).
- **Licence:** BSD-3-Clause, CrispStrobe.
