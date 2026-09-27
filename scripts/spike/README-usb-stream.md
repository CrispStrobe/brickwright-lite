# SPIKE USB pseudocode stream

`usb-stream.py` sends Brickwright SPIKE pseudocode lines directly to a hub
running LEGO MINDSTORMS MicroPython over USB. It was tested with firmware
3.2.36 (`hub.__version__` `v1.5.06.0000-2596c23`). The MINDSTORMS app must be
closed so the serial port is available.

```sh
python3 -m pip install pyserial
python3 scripts/spike/usb-stream.py --probe
python3 scripts/spike/usb-stream.py scripts/spike/example-usb-stream.bw
```

The script identifies devices before running, refuses motor commands on
non-motor ports, limits each run to 10 seconds, and floats motors when it exits.
It accepts `when flag clicked`, `display text "..."`, `display clear`,
`set motor speed A 30`, `start motor A forward`, `stop motor A`,
`run motor A forward 0.6 seconds`, and `wait 0.3 seconds`. Other Brickwright
pseudocode lines fail explicitly. A `start motor` command should be paired
with `stop motor`; the CLI also stops all motors on exit.

This is a USB REPL stream for the MINDSTORMS firmware, separate from the
SPIKE 3 BLE protocol used by Brickwright on the iPad. It does not flash or
upload firmware and it does not yet connect the app's Code tab to USB.
