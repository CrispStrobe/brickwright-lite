# Native MicroPython image selection

The desktop broker exposes two separate actions. `renode.spike.micropython.image.choose`
accepts exactly `{}` and opens the native file dialog. The native owner reads a
bounded regular `.bin` or Intel HEX file, validates its application geometry and
keeps admitted canonical bytes. The caller receives only `selected` or `cancelled`;
it receives no path, filename or image bytes. Unpackaged builds refuse before opening
the dialog. There is no download, firmware URL or editor-supplied filesystem path.

Selection never starts an emulator. `renode.spike.session.start` with exactly
`{"backend":"micropython"}` consumes the pending admission and uses the production
pinned debugger entry. Reset retains its own admitted bytes. Cancelling or failing
a new selection clears any previous pending admission. Concurrent selections and
start while choosing are refused. A slow chooser can outlive the broker's request
deadline, but cannot start a process; a separate explicit startup request is required.
New selections do not alter an already-running debugger session.

Native reading checks handle metadata, caps input at 4 MiB including growth during
reading, refuses nonregular inputs and validates raw/HEX bytes with the existing
admission parser. On Unix, nonblocking open avoids hanging on a selected FIFO.
Errors do not expose the selected path. This code is original BSD-3-Clause source.

Tests cover raw/HEX admission, malformed/oversized/missing/nonregular files,
cancellation, selection contention and refusing startup without an admission. A
compiled mutation retaining the old admission after cancellation is detected.

The OS dialog requires desktop integration testing. Local qualification exercises
the actual native reader, admission owner, explicit production startup, UART and
reset on a supplied MicroPython image. It does not automate the OS dialog. Generated
harnesses, firmware, JSON, logs and raw transcripts stay private.

The follow-up [GUI integration](spike-micropython-gui.md) aligns the frontend with
this qualified service and adds desktop selection/Code-tab execution. Updated public support seeds now supply the `bwspike` motor/sensor API; see the
[GUI setup and program example](spike-micropython-gui.md#robot-programs-and-desktop-setup).
Portable installed packaging and original LEGO firmware remain pending.
