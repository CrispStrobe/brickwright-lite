# Travel Dial — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively and in the browser before promotion.
- **Adaptations:**
  - The licence line points at the packaged licence.
  - The program drops one SPIKE-extension block (`set motor stop action A hold`). The Robot Lab `lab stop motor A hold` block already holds the motor, and the qualification harness loads Robot Lab blocks only.
  - Geometry is unchanged.
- **Law:** Δs = −R·Δθ, fitted R = 28.07 mm, residual 0.15 mm over 42 mm. Disconnection (`connecting_rod` removed): the free sled keeps under 10 mm of its 42 mm stroke.
