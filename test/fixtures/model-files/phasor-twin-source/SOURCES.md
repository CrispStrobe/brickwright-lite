# Phasor Twin — source record

- **Origin:** an automated model-builder task (`stirling_cycle_kinematic_analogy`), CrispStrobe, BSD-3-Clause.
- **Adaptations:** reviewer fix at intake: two 3L pins under the motor base became 2L pins so the frame no longer rocks at a cold start. Geometry and program are otherwise unchanged (canonical model sha256 0a21a1ecfe4f246df957978a78149bdebc039871a614b616ea7cf70281e72db1).
- **Law:** two equal slider-cranks driven 1:1 through one idler with their throws 90° apart. Each piston follows x = r·cos φ + √(L² − (r·sin φ − e)²) with r, L and e from the compiled joints, and the two piston positions enclose π·r² per crank turn. Disconnection: `conrod_B` and `wristpin_B` removed, so piston B loses its drive.
- The in-phase file (`phasor-twin-control`) remains an experimental comparison.
