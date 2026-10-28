# MicroPython UART program lifecycle

New components in this directory use BSD-3-Clause, copyright 2026 Brickwright
contributors. They use browser byte/text primitives and have no runtime or
firmware dependencies. The protocol follows the documented
[MicroPython raw REPL](https://docs.micropython.org/en/v1.26.0/reference/repl.html#raw-mode-and-raw-paste-mode).

`MicroPythonProgramClient` accepts an exclusive, already booted UART2 transport.
The native host owns image admission, startup, simulated time and byte pacing.
`read({signal})` returns 1–4096 bytes and must honor cancellation. `write(bytes,
{signal})` accepts at most 32 bytes and must pace the modeled UART. `close()`
terminates only the owned emulator and releases its hub/arena ownership.
The client exposes no monitor command, filesystem path or firmware download.

`execute(source, {timeoutMs})` accepts nonempty Python of at most 16384 UTF-8
bytes, rejecting embedded UART control characters before any I/O. It interrupts
boot-time code, enters raw mode, sends source in chunks and executes it. It
requires `OK`, stdout EOT, stderr EOT and the final raw prompt, returning
`{stdout, stderr, failed}`. A Python exception is a completed execution with
`failed: true`; transport/protocol errors close the session. Combined wire
output is limited to 65536 bytes; output is returned on completion. Execution
timeout defaults to 30 seconds and accepts 100–300000 milliseconds.

Concurrent execution is rejected. `cancel()` is idempotent, aborts pending
operations and closes the owned process. It deliberately requires process
teardown even if user Python catches interruption. Successful runs retain the
transport for subsequent execution. Late reads cannot complete a canceled run.

Run `node --test test/spike-micropython-raw-repl.test.mjs` from the repository
root. Tests cover fragmented UTF-8 and framing, exceptions, sequential and
concurrent calls, timeout, cancellation, source/output limits and corrupted
acknowledgments/delimiters. The session integration tests use synthetic UART
replies and arena frames; they do not validate actual interpreter firmware.

The retained GUI `RenodeArenaSession` now consumes this client through explicit
`backend: 'micropython'`, Python `source`, no compiled program, and default
topology. Source validation happens before startup. The first frame must identify
`micropython-hub-no6`, transport `none`, a valid image hash, a positive connection
generation, all existing arena capabilities, and `micropython-raw-repl/v1`.
The production bridge uses that same hub, world and clock, admitting observed
motor speeds up to 1110 degrees/second while retaining continuity checks.

The future native operations are `renode.spike.micropython.uart.read` with
`{generation, maxBytes: 4096, deadlineMs: 1000}` and
`renode.spike.micropython.uart.write` with `{generation, bytes}` (1–32 bytes).
Reads require `{generation, bytes}` (1–4096 byte values), or the exact timeout
reply `{generation, timeout: true}`; EOF closes execution. Writes require
`{generation, count}` matching the entire host-paced chunk. Generation is fixed
by the first frame. Invalid or mismatched replies fail closed. Cancellation
aborts locally, ignores late replies and closes the owned native session once.
Execution runs asynchronously alongside arena polling. Exact raw completion
delivers `{sequence: 1, text, truncated, stdout, stderr}` to `onOutput`, with
common GUI `text` limited to 1024 characters; Python stderr reports an error and
closes, and successful completion calls `onCompleted` and closes.

Native UART operations are not registered yet. Missing handlers fail closed;
there is no enabled GUI chooser. Synthetic session and bridge tests exercise
this route without firmware or private captures. This integration is retained
GUI work, not a cleanroom implementation. It provides no SPIKE Python SDK,
USB transport or bootloader compatibility claim.
