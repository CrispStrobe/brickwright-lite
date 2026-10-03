# MicroPython image execution from the Code tab

In a desktop build with the pinned MicroPython simulation profile, choose
**MicroPython · local image (desktop)** in the SPIKE arena's execution selector.
**Choose image…** opens the native chooser for a local raw or Intel HEX application.
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

The tested image has no `hub` or `motor` modules. This path runs ordinary MicroPython;
robot Python bindings remain pending. Full NuttX Python continues to use its own
runner and `brickwright` API. Neither original LEGO firmware nor physical equivalence
is qualified. The live support profile uses a previously qualified local candidate
electrical model. Public source-profile assembly and portable installed packaging
remain pending: ordinary desktop builds without the pinned profile refuse explicitly.
The native chooser never downloads firmware or receives an editor-supplied path.
Unix capsule staging is qualified; non-Unix staging remains unsupported.
New glue uses BSD-3-Clause; existing component/dependency attribution is retained.
