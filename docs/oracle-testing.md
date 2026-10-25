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

The STC oracle uses the project-specific [`CrispStrobe/ucsim-stc`](https://github.com/CrispStrobe/ucsim-stc)
fork, not generic upstream ucsim. Its `stc12_trace` output is parsed with
`parseUcsimTrace`; rows such as `72518 PIN 1.5 PP L` are converted to a `P1.5`
low edge at 72,518 ns. The fork is GPL and remains a CI/local-only oracle,
never a Brickwright runtime dependency. Its companion `emu8051-stc` MIT
`emu_trace` binary is used for instruction, debugger-control, timing, and
peripheral differential checks.

## AVR CPU cross-checks

Brickwright's shipped AVR execution path is the MIT `avr8js` adapter. The
following MIT projects are optional developer-side references, not runtime
dependencies:

- [`cemeyer/avr-emu`](https://github.com/cemeyer/avr-emu) is a useful secondary
  CPU-level oracle. Its instruction tests, binary execution trace, and
  experimental GDB/reverse-step support can cross-check arithmetic, flags,
  branches, stack behavior, and debugger stepping. It is not a board oracle:
  the project documents missing instructions including `SPM`, `SLEEP`, `WDR`,
  and `BREAK`, and has no off-CPU hardware/peripheral model.
- [`Gregwar/avrel`](https://github.com/Gregwar/avrel) is pedagogical material:
  a small RAM/ROM/opcode implementation with documented examples. It is useful
  for independent opcode fixtures and teaching references, but adds no useful
  Arduino peripheral, pin, or board-level fidelity.

Neither project is copied into the app or used as a replacement for `avr8js`.
Their most valuable future use is independent CPU-semantic differential tests;
`simavr` remains the stronger external AVR hardware/peripheral oracle.

Planned oracle adapters:

- `simavr` for ATmega328P Uno/Nano GPIO, timers, PWM, UART, SPI, I²C, ADC, and
  interrupt timing.
- `CrispStrobe/ucsim-stc` for STC/8051 instruction and machine-cycle behavior;
  generic upstream ucsim is not the project oracle.
- `cemeyer/avr-emu` for optional MIT AVR CPU-semantic cross-checks.
- `Gregwar/avrel` for optional MIT opcode fixtures and documentation review.
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
