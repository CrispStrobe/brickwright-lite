# Phasor Twin — source record

- **Origin:** CrispStrobe, BSD-3-Clause, built by the automated model builder and recorded in the experimental checkpoint. The program bytes are unchanged.
- **Geometry repair (2026-10-28):** the 40T idler sat 7.5 LDU inside the motor's output disc, the crank axles were not clocked to the 45° crank plates' axle holes, and several pins ended inside holes. The idler now sits on the motor's output face with the two 16T crank gears in its plane, the bearing blocks above them; the crank axles and their half bushes turn 45° with the plates; the floor members, ties and posts sit on the 20 LDU grid so every pin passes fully through its holes. The checkpoint lists each edit. The mechanism and its law are unchanged.
- **Law:** two crank-sliders, r = 16 mm, L = 48 mm, clocked 90° apart; the loop of piston A against piston B encloses π r² per crank turn (`stirling-quadrature-v1`).
- **Disconnection:** `conrod_B` and `wristpin_B` removed, so piston B loses its stroke.
- The in-phase file (`phasor-twin-control`) remains an experimental comparison.
