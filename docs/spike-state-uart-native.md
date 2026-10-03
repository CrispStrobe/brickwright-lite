# Native program UART result validation

The shared brick-state feed accepts `micropython-prime` only with a canonical
image digest, `micropython-uart/v1` and closed lifecycle `micropythonUart`
metadata. UART generation stays constant through the connection. Commands are
bounded read/write/close objects, checked before sending; requests require the
ready attachment and matching generation. Result data must match the exact
request: complete write count, bounded read bytes, or true close acknowledgment.
Malformed post-send data invalidates the owned feed. Existing NuttX/guest/EV3
commands and snapshot interfaces remain in place.

The request/reply contract module was authored by a fresh no-history agent using
only the functional contract and synthetic fixtures. Restrictions were
instruction-based; complete transcript and actual tool calls are retained and
audited privately. Coordinator integration inspected retained interfaces and
has a separate scope. New code is BSD-3-Clause, Brickwright contributors.
Parsed serde_json::Value cannot detect duplicate source JSON keys; strict
validation applies to the decoded object's final keys and values.

Qualification: 28 tests in an offline harness using the actual Rust modules,
plus warnings-denied Clippy. A compiled mutation removing request-specific
reply validation fails the integration test. Actual production feed against the
Renode state service and locally supplied MicroPython image passed arithmetic,
Ctrl-C/recovery, wrong-generation pre-send rejection, UART close and continued
state sampling. Firmware bytes, runtime scripts, captures, generated JSON and
complete transcripts remain private.

This adds no image chooser, native image launch, broker UART operation or GUI
selection. Those require owned startup, pinned model/profile assets and existing
broker authorization. No original LEGO firmware, USB/bootloader, all-peripheral
or full firmware equivalence claim is made.
