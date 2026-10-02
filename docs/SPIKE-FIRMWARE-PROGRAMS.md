# Code programs in the SPIKE simulation guest

The desktop SPIKE arena can run a supported Code-tab program inside our
simulation-only Cortex-M4 guest. The browser Simulator continues to run the
broader Scratch/native command surface. Both use the same hub and arena.
This route does not upload to physical hardware, run a full NuttX application,
or interpret Python on the guest.

Open Code → SPIKE arena → Free sandbox. On a desktop build packaged with a
program-capable guest, choose **Firmware program (desktop)** and Run to execute
the loaded blocks. **▶ Firmware** in the Code tab compiles the current native
SPIKE or supported SPIKE 3 Python text into blocks first, then starts that
program. Compile warnings/unsupported calls refuse this route instead of
running a stale loaded project. The Python reader's documented velocity
conversion still applies. There is no automatic demo/native fallback.
An older demo-only package gives an explicit rebuild message.

The supported subset is one green-flag script with literal arguments:
A/B motor speed, start, timed run, single-motor relative degrees/rotations,
brake/stop, A/B tank movement, movement for seconds, timed waits, finite repeat,
forever, repeat-until, and wait-until. Sensor conditions read distance D,
force pressed E, or color/reflection C. Comparisons require the sensor on the
left and a literal threshold on the right; distance equality is unsupported.
Speed settings must be outside dynamic loops. The compiler rounds speed to
whole degrees/second, durations to milliseconds and position requests to whole
degrees (including converted rotations); native Simulator precision is broader. Parallel scripts, variables,
procedures, arbitrary expressions, other motor/sensor ports, display, sound,
absolute position, coast and HOLD are rejected by name. These limits apply
only to this firmware program choice.

At most 256 instructions execute for at most 120 seconds of guest time.
The managed desktop session is capped at 120 seconds of wall time, including
startup. The minimal guest platform needs no remote SVD description or
unused STM32 peripheral models.
The guest spends at most 32 immediate instructions per 1 ms interrupt;
zero waits yield an interrupt. A/B continuous commands execute in the same
interrupt, while a relative position move blocks its script until arrival.
The other motor can continue. Motors accelerate at 2000 deg/s², brake at
4000 deg/s², and full arena contact load stalls motion. Position moves use
stopping-distance control and final millidegree quantization. A stall can
release through the arena or end through Stop/timeout. These are synthetic
simulation dynamics, not physical calibration or native-backend equivalence.

Program completion is observed from the guest mailbox after both motors stop.
Stop, reset, changing arena/mat/backend, closing the pane, or a native Code Run
close only the owned managed session before releasing the shared clock.
A new owned session is required to load another program. Source text never
enters a monitor command, process argument, memory address or executable upload:
the broker accepts only versioned, bounded four-integer instructions.

The ABI and guest-side checks are documented in
[our firmware guest](https://github.com/CrispStrobe/brickwright-spike-prime-fw/tree/main/simulation/arena-demo).
The adapter is in
[our Renode integration](https://github.com/CrispStrobe/renode-spike-prime/blob/main/tools/spike_arena_mailbox.py).
New components use BSD-3-Clause; the package retains the guest and Renode
licences. No runtime dependency on alternate firmware is introduced.

To build a local package, use local checkouts of both repos and an installed
Renode executable (no downloads are performed):

```sh
node scripts/prepare-spike-arena-package.mjs /path/to/firmware /path/to/renode-spike-prime /path/to/renode /new/output/directory
```

The guest needs `arm-none-eabi-gcc` and `arm-none-eabi-nm` on PATH. The script
refuses an existing output directory, builds the guest, copies the documented
helpers and licences, then emits a hashed manifest and build-time environment
in `pins.json`. Build the desktop application with those environment values.
The web deployment does not ship or enable the desktop runtime.

Reproducible source checks:

```sh
node --test --import ./scripts/lib/register-gui-scope.mjs test/spike-firmware-program.test.mjs test/spike-renode-arena-session.test.mjs test/native-renode-capability.test.mjs
cargo test --manifest-path tools/renode-arena-proof/Cargo.toml
```

GUI/real-guest tests require the pinned proof executable, built with package
pins, and the current GUI build. Evidence directories must be private; receipts
and implementation transcripts are intentionally not stored in this repository.
