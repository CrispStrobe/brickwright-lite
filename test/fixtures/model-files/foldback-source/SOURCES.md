# Foldback — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively and in the browser before promotion.
- **Adaptations:**
  - The licence line points at the packaged licence.
  - The program drops one SPIKE-extension block (`set motor stop action A hold`). The Robot Lab `lab stop motor A hold` block already holds the motor, and the qualification harness loads Robot Lab blocks only.
  - Geometry is unchanged.
- **Law:** tan(φ/2) = −5·tan(θ/2); output within 0.03° over a 90° sweep. Disconnection (`joint_P_pin` removed): the output leaves the law by more than 200°.
