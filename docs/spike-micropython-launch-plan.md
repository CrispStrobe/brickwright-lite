# Owned MicroPython direct application startup

The native launch plan checks a host-supplied support-package pin and a closed
16-file manifest: retained model source, bounded UART source, four offline board
files, state service and its six helpers, an authored boot seed and licence texts.
The seed must have the exact 65536-byte prefix geometry. The plan rechecks support
files before handing them to the supervisor. The packaged executable pin remains
separate. Package pins and staging roots are native inputs, never editor DTOs.

This initial profile accepts canonical raw applications based at 0x08010000. It
re-admits the bytes and compares all vector metadata. It stages both the image and
an original state configuration in separately owned capsules. Configuration
identity uses the canonical image hash and a native positive safe-integer UART
generation, with fixed shared hub routes. There is no caller monitor command or
endpoint. Numeric Unicode code points safely encode the seed path in the fixed
Python expression; monitor paths support spaces and refuse interpreted characters.

The fixed direct-entry profile loads the retained board models, attaches shared
ports and the paced program UART, loads the application and authored seed, sets
vectors and R0=1, runs one simulated second, then opens the debugger and state
service. It starts the machine. The supervisor retains both capsules through
child/output cleanup. This establishes application entry, not a bootloader path.

Qualification includes manifest pin/model mutation, forged vectors, generation
bounds, changed configuration, two-file lifetime and path checks. A compiled
package-validation bypass mutation is detected. Actual local MicroPython 1.26.1
startup through the supervisor worker and production state feed passed arithmetic,
Ctrl-C/recovery, UART close and owned image/configuration cleanup. That qualification
used a private test seam selecting a previously installed runtime, with its digest
verified by the actual worker; it did not invoke the compile-time packaging entry
or launch the Tauri GUI. The support profile uses the previously qualified local
candidate electrical model. Image bytes, support packages, fixtures, logs and
complete transcripts remain private.

The follow-up [native debugger attachment](spike-micropython-debugger.md) now
qualifies the actual compile-time entry, debugger reset and support pinning tool.
Public source assembly/portable packaging, native chooser, Code-tab selection and
robot Python bindings remain pending. MicroPython lacks
`hub` and `motor` in the tested image. Original LEGO firmware and full hub/peripheral
compatibility remain unqualified. Non-Unix capsule staging remains unsupported.
New launch-plan source is BSD-3-Clause; retained models keep their MIT notices.
