# SPIKE USB pseudocode stream

`usb-stream.py` sends Brickwright SPIKE pseudocode lines directly to a hub
running LEGO MINDSTORMS MicroPython over USB. It was tested with firmware
3.2.36 (`hub.__version__` `v1.5.06.0000-2596c23`). The MINDSTORMS app must be
closed so the serial port is available.

```sh
python3 -m venv ~/.brickwright/venv
~/.brickwright/venv/bin/pip install pyserial
npm run cli -- spike probe
npm run cli -- spike run scripts/spike/example-usb-stream.bw
```

For a chosen Python environment, set `BWLITE_PYTHON=/path/to/python`.
`node bin/bwlite.mjs --help` lists the terminal commands. General pseudocode
conversion uses `bwlite convert PROGRAM.bw --to sb3|c|python|javascript|micropython|basic`;
see the [CLI guide](../../docs/CLI.md). `spike run` accepts only the USB subset
listed below, which is separate from the general compiler dialect.

In the desktop app's Code tab, choose **USB on this computer** and press
**Run on SPIKE USB**. In the iPad app, leave the hub connected to the Mac and
start its bridge in Terminal:

```sh
npm run cli -- spike bridge --port /dev/cu.usbmodemYOUR_HUB
```

The bridge prints a random token. In the iPad Code tab, choose **USB via Mac
on WLAN**, enter `http://MAC_LAN_ADDRESS:8765` and the token, then run the
program. The Mac and iPad must share the WLAN. The bridge holds the serial
port only during a request; close the LEGO MINDSTORMS app first.

The script identifies devices before running, refuses motor commands on
non-motor ports, limits each run to 10 seconds, and floats motors when it exits.
It accepts `DEVICE SPIKE`, `when flag clicked`, `display text "..."`, `display clear`,
`set motor speed A 30`, `start motor A forward`, `stop motor A`,
`run motor A forward 0.6 seconds`, and `wait 0.3 seconds`. Other Brickwright
pseudocode lines fail explicitly. A `start motor` command should be paired
with `stop motor`; the CLI also stops all motors on exit.

This is a USB REPL stream for the MINDSTORMS firmware, separate from the
SPIKE 3 BLE protocol used by Brickwright's BLE extension. It does not flash
or upload firmware. The Code tab streams only the supported subset and
reports unsupported lines instead of silently running a different command.
