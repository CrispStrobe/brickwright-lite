# Native MicroPython image selection

The desktop broker exposes two separate actions. `renode.spike.micropython.image.choose`
accepts exactly `{}` and opens the native file dialog. The native owner reads a
bounded regular `.bin`, Intel `.hex` or DfuSe `.dfu` file, validates its application geometry and
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
reading, refuses nonregular inputs and validates raw/HEX/DFU bytes with the
admission parser. On Unix, nonblocking open avoids hanging on a selected FIFO.
Errors do not expose the selected path. This code is original BSD-3-Clause source.

Tests cover raw/HEX/DFU admission, malformed/oversized/missing/nonregular files,
cancellation, selection contention and refusing startup without an admission. A
compiled mutation retaining the old admission after cancellation is detected.

The OS dialog requires desktop integration testing. Local qualification exercises
the actual native reader, admission owner, explicit production startup, UART and
reset on a supplied MicroPython image. It does not automate the OS dialog. Generated
harnesses, firmware, JSON, logs and raw transcripts stay private.

The follow-up [GUI integration](spike-micropython-gui.md) aligns the frontend with
this qualified service and adds desktop selection/Code-tab execution. Updated public support seeds now supply the `bwspike` motor/sensor API; see the
[GUI setup and program example](spike-micropython-gui.md#robot-programs-and-desktop-setup).
[Resource-relative paths](spike-micropython-installed-resources.md) are available;
signed installers, platform-specific packaging and original LEGO firmware remain
unqualified.

## Local DfuSe applications

The [MicroPython Hub No.6 downloads](https://micropython.org/download/LEGO_HUB_NO6/)
include `.dfu` applications. A user can download one separately and select that
local file; the chooser does not download firmware. DFU import supports version 1
with one target at alternate setting 0 and one application element based at
`0x08010000`. Its CRC, signatures, declared sizes, suffix and exact element boundary
must match. Both whole-file and prefix-plus-target size conventions are accepted,
with no ignored trailing data. Raw application vector, opcode and flash bounds
apply after extraction. Bootloader-containing, multi-target and split-element
containers are refused rather than selecting or discarding regions silently.

Target names and USB vendor/product IDs are inert metadata. They do not select
paths or establish that an image is authentic or compatible with the profile.
The admitted image hash describes canonical application bytes, excluding the
container. Renode starts the application directly; DFU USB transfer and hardware
flashing are outside this route. This importer adds no runtime parser dependency.

Local qualification selected the official MicroPython 1.26.1 DFU through the
production native reader and ran it through the frontend, native supervisor and
Renode. Six-motor GPIO/PWM motion, encoder feedback, A/B shared-arena propagation
and final telemetry/completion passed. The synthetic importer tests detect
mutations that skip CRC, layout and exact-size checks. The OS chooser dialog,
other firmware versions, hardware flashing and original LEGO firmware are not
qualified by this test. Firmware, detailed observations and transcripts remain
private. The importer and tests are newly authored BSD-3-Clause components;
existing runtime/model attribution remains applicable.
