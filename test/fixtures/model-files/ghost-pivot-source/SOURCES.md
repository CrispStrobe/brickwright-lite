# Ghost Pivot — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively and in the browser before promotion.
- **Adaptations:**
  - The licence line points at the packaged licence.
  - The program drops one SPIKE-extension block (`set motor stop action A hold`). The Robot Lab `lab stop motor A hold` block already holds the motor, and the qualification harness loads Robot Lab blocks only.
  - Geometry is unchanged.
- **Law:** tool heading = input heading within 0.002°; remote centre fixed within 0.02 mm. Disconnection (`upper_link` removed): the remote centre moves 160 mm.
