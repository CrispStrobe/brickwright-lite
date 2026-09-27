# Terminal commands: `bw` and `bwlite`

`.bw` is the **Brickwright pseudocode file extension**. It is not a command.

`bw` is the CLI in the separate [sb3-creator compiler repository](https://github.com/CrispStrobe/sb3-creator)
(`bin/bw.mjs` there). Older architecture and proof documents use commands such
as `bw transpile` to describe tests run in that repository. The `bw` executable
is not installed by Brickwright Lite and is not needed to use this checkout.

`bwlite` is this repository's CLI, implemented in [`bin/bwlite.mjs`](../bin/bwlite.mjs).
After installing dependencies and populating `packages/` as described in the
[README](../README.md#quick-start), run it as `npm run cli -- COMMAND` from this
checkout or `npm link` once and invoke `bwlite` from any directory. It calls
the pinned compiler and language readers shipped with the app. `compile` in
`bwlite` is retained as a compatibility alias for `convert`; it does not build
firmware unless you explicitly use `8051 build` or a toolchain command.

| Task | Lite command |
| --- | --- |
| Validate pseudocode | `bwlite check program.bw` |
| Convert pseudocode to a Scratch project | `bwlite convert program.bw --to sb3 --out program.sb3` |
| Recover pseudocode from a project or code file | `bwlite read program.sb3 --out program.bw` |
| Emit C, host C, Python, JavaScript, MicroPython, or BASIC | `bwlite convert program.bw --to c --out program.c` (change `--to`) |
| List and change target boards | `bwlite devices [program.bw]`, `bwlite retarget program.bw stc15f2k60s2 --out revised.bw` |
| Compile STC/8051 pseudocode or C to Intel HEX | `bwlite 8051 build program.bw --out program.ihx` (installed SDCC) |
| Flash an STC/8051 | `bwlite 8051 flash program.ihx --port /dev/cu.usbserial-XXXX` (installed stcgal) |
| Inspect USB SPIKE ports or run the supported stream subset | `bwlite spike probe`, `bwlite spike run program.bw` |
| Import or export a LEGO MINDSTORMS archive | `bwlite mindstorms import project.lms --out project.sb3`, `bwlite mindstorms export project.sb3 --template original.lms --out revised.lms` |
| Use an existing repository CLI | `bwlite toolchain ...`, `bwlite machine ...`, `bwlite fpga ...`, `bwlite makecode ...` |

The `machine` command handles emulator configurations and boot plans. It is
not a headless run/step/debug command for all chip emulators; those controls
are currently in the app. The terminal conversion readers cover documented
language subsets and report unmapped constructs. `spike run` accepts a smaller
USB streaming subset than the general pseudocode compiler, as described in
the [SPIKE USB guide](../scripts/spike/README-usb-stream.md).
