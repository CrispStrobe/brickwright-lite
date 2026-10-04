# MicroPython image execution from the Code tab

In a desktop build with the pinned MicroPython simulation profile, choose
**MicroPython · local image (desktop)** in the SPIKE arena's execution selector.
**Choose image…** opens the native chooser for a local `.bin`, Intel `.hex` or
single-application DfuSe `.dfu` image. DFU import checks the container CRC and
geometry before admitting its application bytes. It does not run a DFU bootloader
or flash a physical hub.
In the Code tab, select Python and press **▶ MicroPython · Image**. It uses a pending
selected image or opens the chooser, then starts the current source in Renode.
Cancellation never starts an emulator. Caller/lease authorization precedes worker
dispatch; the native dialog and emulator work run off the UI thread. The arena's ordinary Run button is disabled
for this backend because its input comes from the Code tab. Web builds do not offer
an active native image route.

This uses the existing virtual hub and arena. The profile exposes all A–F electrical
ports; its default attachments are two motors and color, distance and force sensors.
The state service offers arena clock/motor-output capabilities only with both drive
encoders and the owned UART present. Native observations drive the same world and
hub telemetry as the other arena backends; arena sensor inputs go back to modeled
ports. Stop, failure and completion release the owned process and hub/clock ownership.
The synthetic mechanical policy is not a calibrated physical SPIKE model.

The frontend now uses `micropython-prime`, `micropython-uart/v1` and the native UART
generation metadata. It unwraps the native snapshot/data envelope, verifies image
and generation identity, sends bounded byte-only requests and yields on empty reads.
Native startup already runs the CPU, so the frontend does not issue a second run.
Source is bounded to 16384 UTF-8 bytes and uploaded in at most 32-byte chunks.

Qualification ran the production frontend session library against the actual native
image owner/debugger/UART and local Renode/MicroPython 1.26.1. Python register writes
configured the modeled GPIO/PWM motor bridges; both motor observations changed and
the shared robot moved about 14.7 cm. Arena sensor inputs, output `42`, completion
and ownership cleanup passed. Disabling arena wheel motion makes this live comparison
fail despite successful Python output and motor telemetry. Code-tab method tests
cover selection, reuse, cancellation, invalid source and late completion after pane
disposal; a cancellation bypass mutation is detected. UART image/generation changes
are refused. The OS dialog and full desktop DOM route were not automated locally.
Generated harnesses, firmware, observations, support packages and complete transcripts
remain private.

## Robot programs and desktop setup

The upstream application has no `hub` or `motor` modules. The public support seed
now supplies Brickwright's BSD `bwspike` API: A–F motor power, braking/coasting,
encoder and speed reads, timed speed control and absolute encoder moves; C color,
D distance and E force readings. These commands run inside the emulated CPU and
use modeled GPIO/PWM/UART devices. They feed the same hub and arena, rather than
moving a second world from Python.

For example, enter this in the Python Code tab:

```python
from bwspike import Motor, ColorSensor, stop_all

motor = Motor('A')
try:
    motor.run_speed(40, 1500)
    print(motor.run_to(180, speed_limit=30, timeout_ms=10000))
    print(ColorSensor().reflection())
finally:
    stop_all()
```

Reassemble support from the current reviewed Renode repository and regenerate
its pins before rebuilding the desktop application. Older support seeds do not
contain this API. The [support assembly and API contract](https://github.com/CrispStrobe/renode-spike-prime/blob/main/docs/spike-micropython-support.md)
provides reproducible commands, units, bounds, timing and error behavior.
The local application image is still selected separately; no firmware is bundled.

Live qualification tracked 40% speed at 38–39% under 25% modeled load
(tolerance: three percentage points), reached absolute targets within two encoder
degrees, detected lack of encoder progress and braked A on Ctrl-C while B remained
running. Sensor boundary values and shared-arena motion also passed. This does not
establish physical calibration or general hotplug support.
Feedback commands are synchronous and require a single program thread. Timed
speed commands cannot guarantee unreachable speed targets; position completion
does not provide active holding afterward.

Full NuttX Python continues to use its own runner and `brickwright` API. Original
LEGO firmware and physical equivalence remain unqualified. Public source-profile
assembly is available; [resource-relative paths](spike-micropython-installed-resources.md)
allow configured desktop packages to move between installations. Signed installers
and platform-specific packaging remain unqualified. Ordinary desktop builds
without configured runtime/support pins refuse explicitly. The
native chooser never downloads firmware or receives an editor-supplied path.
Unix capsule staging is qualified; non-Unix staging remains unsupported.
New glue uses BSD-3-Clause; existing component/dependency attribution is retained.

## Six motors in the sandbox

Choose MicroPython and **Six motors A–F (sandbox)** in the arena's firmware
device selector, then run Python from the Code tab. This selection survives the
Code-tab run action while sandbox mode is active. Use a local image containing
`bwspike` with freshly assembled support and regenerated desktop pins; ordinary
unconfigured packages refuse this route explicitly. No firmware is bundled.

```python
from bwspike import Motor, wait, stop_all

motors = [Motor(port) for port in 'ABCDEF']
try:
    for motor in motors:
        motor.dc(30)
    wait(1000)
    stop_all()
    print(motors[5].run_to(90))
finally:
    stop_all()
```

A/B drive the arena rover; C–F are auxiliary motors. All six publish encoder and
speed observations through the existing shared hub. Six mode replaces mounted
sensors with motors, so sensor reads fail with a device-type error. The default
A/B plus sensors profile remains available. Save/Load buttons belong to NuttX
program storage and are not shown for MicroPython.

Local qualification ran the production frontend session/native launcher/Renode
CPU route: all six motors moved with the requested alternating signs, C–F
sequential absolute moves reached 90 degrees within two encoder degrees, A/B
moved the arena rover, and program completion released hub and clock ownership.
This is modeled behavior, not physical-hub calibration. Feedback commands remain
synchronous; multiport commands do not promise synchronized starts. `stop_all()`
brakes A/B and auxiliary ports already verified as motors by the current module.

## Final telemetry at successful completion

After the raw REPL reports success, the session pauses its polling loop and waits
for any poll already in flight. It then requests one fresh native state frame.
The frame must belong to the same image and ready UART generation and satisfy
the existing sequence, clock, topology, motor and motion bounds. The shared hub
and arena receive that frame before the GUI announces completion and closes the
owned session. An invalid final frame reports a failure and cleans up; it does
not announce successful completion or apply invalid motor observations.

Stop during final sampling suppresses late frame publication and completion.
Completion does not promise that a program has electrically stopped its motors;
programs must still brake or coast explicitly as required. This samples the
modeled state after source execution, rather than freezing the emulated CPU at
its final Python statement. The existing sampling interval and numerical bounds
remain unchanged. NuttX's persistent-program completion path is unchanged.
