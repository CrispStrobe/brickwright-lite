# Reviewed schematic baselines

These SVGs are deterministic output from `scripts/render-schematic.mjs`. They
are deliberately checked into source control: a mechanically valid diagram can
still be a poor explanation, so the corpus geometry gate is necessary but not
sufficient.

Reviewed on 2026-08-21:

- `01-blink-circuit.pico.svg` — simple teaching loop; MCU, LED, resistor and
  power references remain identifiable and connected without a label thicket.
- `10-motor-speed-circuit.pico.svg` — analog/electromechanical case from the
  reported regression; potentiometer wiper and transistor B/C/E meet their
  drawn terminals, while motor and PWM paths route around symbols.
- `08-led-chaser-595-circuit.pico.svg` — dense repeated bank; conventional net
  labels are preferred to overlapping bus trunks.
- `z80-pd-bench-circuit.svg` — retro-machine stress case; packages remain
  separated and bounded, with labelled buses at a readable fit scale.

Run `node --test test/schematic-visual-baselines.test.mjs` after an intentional
layout change. Review regenerated SVG/PNG output before updating these files.
