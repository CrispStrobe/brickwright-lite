# External simulator oracles

Brickwright uses external simulators only as optional, black-box test oracles.
They are not dependencies of the app, are not imported by the GUI, and their
source is not copied into this repository.

An oracle adapter converts a simulator's output to rows of:

```json
{"timeNs":"1000","pin":"D13","value":1}
```

`scripts/oracle-trace.mjs` normalizes rows and compares observable edges. The
adapter may run a separately installed executable, but it must not link that
executable into Brickwright or make the shipped app depend on it.

For AVR, `scripts/oracle-simavr.mjs` runs a separately installed `simavr`, reads
its VCD output, and maps explicitly named signals to board pins. It does not
assume that a simulator register name is automatically an Arduino pin; each
fixture must provide that mapping.

Planned oracle adapters:

- `simavr` for ATmega328P Uno/Nano GPIO, timers, PWM, UART, SPI, I²C, ADC, and
  interrupt timing.
- `ucsim` for STC/8051 instruction and machine-cycle behavior.
- PICSimLab scenarios for board-level smoke cases where its board model adds
  value beyond the underlying simulator.
- Velxio only as an optional black-box comparison for selected Uno/Pico cases;
  its AGPL/commercial dual license means it must remain entirely outside the
  product and dependency graph.

The first fixtures should be tiny, deterministic programs: GPIO blink, timer
toggle, PWM midpoint, UART byte, and ADC threshold. A mismatch is evidence to
investigate, not an automatic declaration that either implementation is wrong:
clock configuration, reset vector, bootloader bytes, peripheral register
defaults, and pin naming must be recorded with each fixture.
