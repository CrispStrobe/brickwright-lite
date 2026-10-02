# SPIKE execution choices

The browser's Simulator uses our independent backend and the shared 2D/3D
arena. Desktop firmware choices run ARM code in Renode: the small simulation
guest runs the supported compiled program ABI; Full NuttX runs our retained
protected firmware, the same program ABI, and embedded MicroPython. Each
choice feeds observed motors into the same arena and receives its sensor
values and loads. The native controller does not advance firmware-owned motors.

In the arena's Execution selector, choose Firmware program for the small
guest or Full NuttX for the full firmware. The Code-tab Firmware action sends
the strictly compiled supported program to that selection. The separate
Python · NuttX action uploads Python source directly to embedded MicroPython.
Its low-level robot module is `brickwright`, for example:

```python
import brickwright as b
print('starting')
b.motor(b.A, 300)
b.sleep_ms(150)
```

This module is separate from LEGO's Python SDK. Supported LEGO SPIKE App 3
Python can still use the existing conversion-to-blocks route and then the
compiled firmware runner. Unsupported commands fail before upload. Firmware
programs currently use motors A/B and arena sensors C/D/E. Python source is
limited to 4095 UTF-8 bytes; output is limited to 1024 bytes and marked when
truncated. Python filesystem imports and networking are unavailable.

Build our full firmware first, then stage a new desktop package:

```sh
node scripts/prepare-spike-nuttx-package.mjs \
  /path/to/brickwright-spike-prime-fw \
  /path/to/renode-spike-prime \
  /path/to/renode-infrastructure-spike-prime \
  /path/to/renode /private/new-full-package
```

Build the desktop app with the environment in `pins.json` to use that package
alone. To offer both firmware choices, prepare the small guest with
`scripts/prepare-spike-arena-package.mjs`; use its `pins.json` plus the full
package's `alongside-pins.json`. Both must pin the same Renode executable.
The files pin images, launcher/configuration, model/helper code and licence
files. Caller arguments choose only `guest` or `nuttx`; they never supply a
firmware path, monitor text or a RAM address. A missing package fails clearly.
Generated package manifests, test JSON, logs and transcripts stay private.

Validation includes the host codec's boundary/error/cancellation tests, the
actual native reader and Scratch compiler, arena/session ownership tests,
Rust policy/state-feed tests, and actual full ARM execution through the
supervisor and packet transport. The Renode repository provides reproducible
source and full-firmware scenario runners. A synthetic 30-degree move is
qualified within three degrees; no complete equivalence or physical accuracy
is claimed. Full-image startup can be slow on busy hosts; the existing desktop
session time and output limits remain enforced.

To repeat the desktop caller check, generate synthetic packets in a new private
file and build the Rust tests with both sets of package pins:

```sh
node --experimental-default-type=module scripts/prepare-spike-nuttx-caller-fixtures.mjs /private/new-callers.json
BW_NUTTX_CALLER_FIXTURES=/private/new-callers.json cargo test --manifest-path apps/tauri/src-tauri/Cargo.toml packaged_spike_backends_run_native_and_python_callers -- --ignored --test-threads=1
```

The check selects the small guest, closes it, selects full NuttX, uploads actual
native-reader/Scratch-compiler output, and verifies ARM-side Python output and
motor movement. The fixture path is a test-only environment variable and is
never accepted by the desktop runtime's capability interface.

The source-built full firmware now formats and mounts blank simulated flash
as LittleFS. Qualification covers mixed CPU/SPI receive-DMA reads in direct
and FIFO modes; regression mutations detect stale requests and FIFO overreads.
See the Renode repository's `docs/prime-nuttx-qualification.md` for commands.
File operations and persistence across emulator restarts, general DMA FIFO
packing/bursts, USB OTG, actual BLE transport and runtime MPU isolation still
need qualification. Original LEGO and upstream LEGO_HUB_NO6
MicroPython images are separate local CPU-probe paths, not qualified arena
backends, and are not packaged by these scripts. LabWired would need additional
SPIKE-specific peripheral/LPF2 integration; Renode is the qualified path here.

New upload/session/package components use BSD-3-Clause; see
`licenses/spike-nuttx-BSD-3-Clause.txt`. Retained infrastructure and full-firmware
notices remain applicable and are included in staged packages.
