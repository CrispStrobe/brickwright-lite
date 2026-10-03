# Staged native MicroPython UART transport

The new transport uses BSD-3-Clause, copyright 2026 Brickwright contributors.
It is compiled for desktop builds and tested with synthetic loopback sockets.
It has no registered native command, runtime consumer or firmware chooser.

`SpikeMicroPythonUart` owns one TCP byte connection and a native session
generation. Typed requests read 1–4096 bytes with a 1–1000 ms deadline, write
1–32 bytes, or close that generation's connection. Wrong generations and
oversized requests fail before I/O. Concurrent readers/writers return `Busy`;
reads and writes hold separate local locks. EOF, timeout, cancellation and
unavailability are distinct outcomes. Close is idempotent and can interrupt a
pending read without waiting for its lock. Other connections remain live.

The endpoint is an opaque native reservation token. Its handoff to an analyzer
listener still needs association with the admitted emulator process: releasing
a reserved port does not authenticate the next listener. The future supervisor
must fail on analyzer bind failure and confirm readiness/ownership before
connecting. No web request may choose the endpoint or supply monitor text.
Generation correlation is supplementary to native broker authorization.

Integration still requires caller-image admission, a qualified Renode UART
analyzer, strict broker DTO decoding, fresh generations and owned process
teardown. TCP chunk limits provide no simulated UART pacing; that must be
supplied by the owner and tested against the modeled UART. The GUI raw-REPL
client expects abort-aware reads, paced writes and closure of its owned emulator
to release hub/arena ownership. This socket module closes only its own socket.

Reproduce the seven std-only socket tests without a firmware image or Tauri
build, directing the binary to a local private build directory:

```sh
rustc --edition=2021 --test -D warnings \
  apps/tauri/src-tauri/src/spike_micropython_uart.rs \
  -o /private/build/spike-micropython-uart-tests
/private/build/spike-micropython-uart-tests
```

Tests cover fragmented binary data, preserving bytes beyond a bounded read,
write limits, wrong generations, EOF, read deadline, competing reads, prompt
close cancellation, repeated close, and leaving another connection usable.
This is a retained integration component, not a whole-backend independence or
actual emulator UART qualification claim.
