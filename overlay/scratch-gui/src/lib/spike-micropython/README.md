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
acknowledgments/delimiters. Actual interpreter framing was also checked locally
with the Renode wrapper's `check_prime_micropython.py --raw-repl-test`; generated
captures and comparison results remain private.

This protocol component is not yet an enabled GUI firmware choice. Image
admission, native RPC policy, bidirectional UART ownership and shared-arena
identity admission must be wired and exercised before that choice is exposed.
It provides no SPIKE Python SDK, USB transport or bootloader compatibility claim.
